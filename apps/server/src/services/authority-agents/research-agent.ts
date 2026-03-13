/**
 * Research Authority Agent - Deep Project Research AI Agent
 *
 * Upgraded with patterns from LangChain's open_deep_research:
 * - Supervisor-Researcher decomposition: decomposes into 3-5 sub-topics
 * - Iteration budgets: per-subtopic limits (max 6 turns, max 10 tool calls)
 * - Reflection step: assesses sufficiency after each sub-researcher completes
 * - Structured citations: verbatim code excerpts with file paths + line numbers, web URLs
 * - Progressive compression: summarizes web results to 25-30% before synthesis
 * - Model tiering: Haiku for summarization, Sonnet for research, Opus for synthesis
 * - Parallel sub-researchers: concurrent Claude sessions per sub-topic
 * - Token overflow recovery: detects token limits, truncates, retries
 *
 * Research status lifecycle:
 *   idle → running → complete (or failed)
 */

import { createLogger } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import { getResearchFilePath } from '@protolabsai/platform';
import fs from 'fs';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { ProjectService } from '../project-service.js';
import { projectArtifactService } from '../project-artifact-service.js';
import { simpleQuery, streamingQuery } from '../../providers/simple-query-service.js';
import { createAgentState, withProcessingGuard, type AgentState } from './agent-utils.js';

const logger = createLogger('ResearchAgent');

// ── Model Tiering ──────────────────────────────────────────────────────────
/** Haiku for web result summarization (cheap, fast) */
const SUMMARIZATION_MODEL = resolveModelString('haiku');
/** Sonnet for sub-topic research (balanced) */
const RESEARCH_MODEL = resolveModelString('sonnet');
/** Opus for final synthesis (highest quality) */
const SYNTHESIS_MODEL = resolveModelString('opus');

/** Allowed tools for research sessions — read-only, no Edit/Write/Bash */
const RESEARCH_TOOLS = ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'];

// ── Iteration Budget Constants ─────────────────────────────────────────────
/** Max turns per sub-topic researcher */
const SUB_TOPIC_MAX_TURNS = 6;
/** Max concurrent parallel sub-researchers */
const MAX_PARALLEL_RESEARCHERS = 3;
/** Max retries on token overflow */
const TOKEN_OVERFLOW_MAX_RETRIES = 2;
/** Target compression ratio for web results (25-30%) */
const WEB_COMPRESSION_TARGET = 0.3;

// ── Types ──────────────────────────────────────────────────────────────────

interface ResearchTriggeredPayload {
  projectPath: string;
  projectSlug: string;
  goal?: string;
  description?: string;
}

/** A research sub-topic decomposed by the supervisor */
interface SubTopic {
  id: string;
  name: string;
  description: string;
  searchStrategy: string;
}

/** Findings from a single sub-topic investigation */
interface SubTopicFindings {
  topicId: string;
  topicName: string;
  rawFindings: string;
  citations: Citation[];
  sufficient: boolean;
  reflectionNote: string;
}

/** A citation linking a finding to its source */
interface Citation {
  type: 'codebase' | 'web';
  /** File path with line number, or URL */
  source: string;
  /** Verbatim excerpt or summary */
  excerpt: string;
}

export class ResearchAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly projectService: ProjectService;

  /** Agent state (agents, initialization, processing tracking) */
  private readonly state: AgentState;

  /** Whether the global event listener has been registered */
  private listenerRegistered = false;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    projectService: ProjectService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.projectService = projectService;
    this.state = createAgentState();

    this.registerEventListener();
  }

  /**
   * Register a single global event listener for research trigger events.
   */
  private registerEventListener(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;

    this.events.subscribe((type, payload) => {
      if (type === 'project:lifecycle:launched') {
        const data = payload as {
          projectPath?: string;
          projectSlug?: string;
        };
        if (!data.projectPath || !data.projectSlug) return;

        void this.triggerResearch({
          projectPath: data.projectPath,
          projectSlug: data.projectSlug,
        });
      }
    });
  }

  /**
   * Trigger research for a project.
   * Can also be called directly for explicit research requests.
   */
  async triggerResearch(payload: ResearchTriggeredPayload): Promise<void> {
    const { projectPath, projectSlug } = payload;
    if (!projectPath || !projectSlug) return;

    return withProcessingGuard(this.state, `${projectPath}:${projectSlug}`, async () => {
      await this.runResearch(projectPath, projectSlug);
    });
  }

  // ── Phase 1: Supervisor — Decompose into Sub-Topics ────────────────────

  /**
   * Use the supervisor model to decompose the research goal into 3-5
   * independent sub-topics, each with a clear search strategy.
   */
  private async decomposeIntoSubTopics(
    projectSlug: string,
    title: string,
    goal: string | undefined,
    description: string | undefined,
    cwd: string
  ): Promise<SubTopic[]> {
    logger.info(`[ResearchAgent] Decomposing research into sub-topics for: ${projectSlug}`);

    const decompositionPrompt = `You are a research supervisor. Given a software project, decompose the research task into 3-5 independent sub-topics that can be investigated in parallel.

Each sub-topic should focus on a distinct aspect:
- Architecture & codebase patterns
- Integration points & dependencies
- External libraries & approaches
- Testing strategy & constraints
- Domain-specific research (if applicable)

Respond with ONLY a valid JSON array. No markdown, no code blocks, no explanation.
Each element must have: id (string), name (string), description (string), searchStrategy (string).

Example format:
[{"id":"arch","name":"Architecture Patterns","description":"...","searchStrategy":"Search for src/ directory structure, service patterns, dependency injection..."}]

Project: ${title}
${goal ? `Goal: ${goal}` : ''}
${description ? `Description: ${description}` : ''}`;

    const result = await simpleQuery({
      prompt: decompositionPrompt,
      model: RESEARCH_MODEL,
      cwd,
      maxTurns: 1,
      allowedTools: [],
    });

    return this.parseSubTopics(result.text);
  }

  /**
   * Parse the supervisor's JSON response into SubTopic objects.
   * Includes fallback extraction from markdown code blocks.
   */
  private parseSubTopics(text: string): SubTopic[] {
    // Try direct JSON parse first
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return this.validateSubTopics(parsed);
      }
    } catch {
      // Fall through to regex extraction
    }

    // Fallback: extract JSON from markdown code blocks
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.validateSubTopics(parsed);
        }
      } catch {
        // Fall through to defaults
      }
    }

    // Final fallback: default sub-topics
    logger.warn('[ResearchAgent] Failed to parse sub-topics from supervisor, using defaults');
    return [
      {
        id: 'arch',
        name: 'Architecture & Codebase Patterns',
        description: 'Explore project structure, existing services, and architectural patterns',
        searchStrategy:
          'Search src/ directories, package.json, tsconfig files for conventions and patterns',
      },
      {
        id: 'integration',
        name: 'Integration Points & Dependencies',
        description: 'Identify modules this project would interact with or extend',
        searchStrategy:
          'Search for imports, exports, service registrations, and dependency injection patterns',
      },
      {
        id: 'external',
        name: 'External Libraries & Approaches',
        description: 'Research industry best practices and relevant libraries',
        searchStrategy:
          'Search the web for relevant frameworks, libraries, and architectural approaches',
      },
      {
        id: 'testing',
        name: 'Testing Strategy & Constraints',
        description: 'Understand testing patterns and identify potential constraints',
        searchStrategy:
          'Search for test files, testing utilities, CI configuration, and known limitations',
      },
    ];
  }

  /**
   * Validate and normalize parsed sub-topic objects.
   */
  private validateSubTopics(items: unknown[]): SubTopic[] {
    const validated: SubTopic[] = [];
    for (const item of items) {
      const obj = item as Record<string, unknown>;
      if (obj.id && obj.name && obj.description) {
        validated.push({
          id: String(obj.id),
          name: String(obj.name),
          description: String(obj.description),
          searchStrategy: String(obj.searchStrategy || obj.description),
        });
      }
    }
    // Ensure we have at least 3, at most 5
    return validated.slice(0, 5).length >= 3 ? validated.slice(0, 5) : this.parseSubTopics(''); // fallback to defaults
  }

  // ── Phase 2: Sub-Researchers — Investigate Each Topic ──────────────────

  /**
   * Run a single sub-topic researcher with its own iteration budget.
   * Each researcher gets SUB_TOPIC_MAX_TURNS turns and must produce
   * findings with inline citations.
   */
  private async investigateSubTopic(
    topic: SubTopic,
    projectSlug: string,
    title: string,
    cwd: string
  ): Promise<SubTopicFindings> {
    logger.info(`[ResearchAgent] Investigating sub-topic: ${topic.name} (${topic.id})`);

    const subResearchPrompt = `You are a focused researcher investigating ONE specific sub-topic for a software project.

**Project:** ${title} (${projectSlug})
**Sub-Topic:** ${topic.name}
**Description:** ${topic.description}
**Search Strategy:** ${topic.searchStrategy}

IMPORTANT RULES:
1. Stay focused on THIS sub-topic only. Do not investigate other areas.
2. You have a budget of ${SUB_TOPIC_MAX_TURNS} turns — be efficient.
3. For EVERY finding, include an inline citation:
   - Codebase: [FILE: path/to/file.ts:42] followed by verbatim code excerpt
   - Web: [URL: https://example.com] followed by key insight
4. After your investigation, assess: "Is this sufficient?" If not, explain what's missing.

Your output MUST follow this format exactly:

## Findings: ${topic.name}

### Key Discoveries
(numbered findings, each with [FILE:...] or [URL:...] citation)

### Code Excerpts
(verbatim code blocks with file paths and line numbers)

### Reflection
**Sufficient:** yes/no
**Assessment:** (1-2 sentences on completeness)
**Missing:** (what would need more investigation, if any)`;

    try {
      const result = await this.queryWithTokenOverflowRecovery(
        subResearchPrompt,
        RESEARCH_MODEL,
        cwd,
        SUB_TOPIC_MAX_TURNS
      );

      const findings = result.text || '';
      const citations = this.extractCitations(findings);
      const { sufficient, note } = this.parseReflection(findings);

      logger.info(
        `[ResearchAgent] Sub-topic ${topic.id} complete: ${findings.length} chars, ` +
          `${citations.length} citations, sufficient=${sufficient}`
      );

      return {
        topicId: topic.id,
        topicName: topic.name,
        rawFindings: findings,
        citations,
        sufficient,
        reflectionNote: note,
      };
    } catch (error) {
      logger.warn(`[ResearchAgent] Sub-topic ${topic.id} failed:`, error);
      return {
        topicId: topic.id,
        topicName: topic.name,
        rawFindings: `Investigation failed: ${error instanceof Error ? error.message : String(error)}`,
        citations: [],
        sufficient: false,
        reflectionNote: 'Sub-topic investigation encountered an error.',
      };
    }
  }

  /**
   * Run sub-topic researchers in parallel batches.
   * Dispatches up to MAX_PARALLEL_RESEARCHERS concurrently.
   */
  private async investigateAllSubTopics(
    topics: SubTopic[],
    projectSlug: string,
    title: string,
    cwd: string
  ): Promise<SubTopicFindings[]> {
    const allFindings: SubTopicFindings[] = [];

    // Process in parallel batches
    for (let i = 0; i < topics.length; i += MAX_PARALLEL_RESEARCHERS) {
      const batch = topics.slice(i, i + MAX_PARALLEL_RESEARCHERS);
      logger.info(
        `[ResearchAgent] Dispatching parallel batch ${Math.floor(i / MAX_PARALLEL_RESEARCHERS) + 1}: ` +
          `${batch.map((t) => t.id).join(', ')}`
      );

      const batchResults = await Promise.allSettled(
        batch.map((topic) => this.investigateSubTopic(topic, projectSlug, title, cwd))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          allFindings.push(result.value);
        } else {
          logger.warn(`[ResearchAgent] Sub-researcher failed:`, result.reason);
        }
      }
    }

    return allFindings;
  }

  // ── Phase 3: Reflection — Assess Sufficiency ───────────────────────────

  /**
   * Supervisor reflects on all sub-topic findings to determine if
   * research is sufficient or if specific gaps need filling.
   */
  private async reflectOnFindings(
    findings: SubTopicFindings[],
    title: string,
    goal: string | undefined,
    cwd: string
  ): Promise<{ sufficient: boolean; gaps: string[] }> {
    const findingsSummary = findings
      .map(
        (f) =>
          `### ${f.topicName}\n` +
          `- Citations: ${f.citations.length}\n` +
          `- Self-assessed sufficient: ${f.sufficient}\n` +
          `- Reflection: ${f.reflectionNote}\n` +
          `- Preview: ${f.rawFindings.slice(0, 300)}...`
      )
      .join('\n\n');

    const reflectionPrompt = `You are a research supervisor reviewing sub-topic findings.

Project: ${title}
${goal ? `Goal: ${goal}` : ''}

Sub-topic findings summary:
${findingsSummary}

Assess whether the combined research is sufficient to write a comprehensive report.

Respond with ONLY valid JSON (no markdown, no code blocks):
{"sufficient": true/false, "gaps": ["gap description 1", "gap description 2"]}

Be conservative: if any critical area lacks citations or depth, mark as insufficient.`;

    try {
      const result = await simpleQuery({
        prompt: reflectionPrompt,
        model: RESEARCH_MODEL,
        cwd,
        maxTurns: 1,
        allowedTools: [],
      });

      const text = result.text.trim();
      // Try direct parse, then regex extraction
      let parsed: { sufficient: boolean; gaps: string[] } | undefined;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            // fall through
          }
        }
      }

      if (parsed && typeof parsed.sufficient === 'boolean') {
        return {
          sufficient: parsed.sufficient,
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
        };
      }
    } catch (error) {
      logger.warn('[ResearchAgent] Reflection query failed:', error);
    }

    // Default: treat as sufficient to avoid infinite loops
    return { sufficient: true, gaps: [] };
  }

  // ── Phase 4: Progressive Compression ───────────────────────────────────

  /**
   * Compress findings using Haiku to reduce token usage before synthesis.
   * Targets 25-30% of original length while preserving key facts and citations.
   */
  private async compressFindings(findings: SubTopicFindings[]): Promise<string> {
    const compressedSections: string[] = [];

    for (const finding of findings) {
      // Short findings don't need compression
      if (finding.rawFindings.length < 2000) {
        compressedSections.push(
          `## ${finding.topicName}\n\n${finding.rawFindings}\n\n` +
            `**Citations:** ${finding.citations.length} sources`
        );
        continue;
      }

      try {
        const targetLength = Math.floor(finding.rawFindings.length * WEB_COMPRESSION_TARGET);

        const compressionPrompt = `Compress the following research findings to approximately ${targetLength} characters.

RULES:
1. Preserve ALL [FILE: ...] and [URL: ...] citations verbatim
2. Keep verbatim code excerpts intact
3. Remove redundant explanations and filler text
4. Maintain the factual density — every sentence should contain a finding
5. Output compressed findings only, no meta-commentary

Findings to compress:
${finding.rawFindings}`;

        const result = await simpleQuery({
          prompt: compressionPrompt,
          model: SUMMARIZATION_MODEL,
          cwd: process.cwd(),
          maxTurns: 1,
          allowedTools: [],
        });

        const compressed = result.text || finding.rawFindings;
        const ratio = compressed.length / finding.rawFindings.length;
        logger.info(
          `[ResearchAgent] Compressed ${finding.topicId}: ${finding.rawFindings.length} → ` +
            `${compressed.length} chars (${Math.round(ratio * 100)}%)`
        );

        compressedSections.push(
          `## ${finding.topicName}\n\n${compressed}\n\n` +
            `**Citations:** ${finding.citations.length} sources`
        );
      } catch (error) {
        logger.warn(`[ResearchAgent] Compression failed for ${finding.topicId}, using raw:`, error);
        compressedSections.push(
          `## ${finding.topicName}\n\n${finding.rawFindings}\n\n` +
            `**Citations:** ${finding.citations.length} sources`
        );
      }
    }

    return compressedSections.join('\n\n---\n\n');
  }

  // ── Phase 5: Synthesis — Final Report with Opus ────────────────────────

  /**
   * Use Opus to synthesize all compressed findings into a final,
   * structured research report with inline citations.
   */
  private async synthesizeReport(
    compressedFindings: string,
    allCitations: Citation[],
    title: string,
    projectSlug: string,
    goal: string | undefined,
    description: string | undefined,
    cwd: string
  ): Promise<string> {
    logger.info(`[ResearchAgent] Synthesizing final report with ${allCitations.length} citations`);

    // Build citation reference section
    const citationIndex = allCitations
      .map((c, i) => {
        const prefix = c.type === 'codebase' ? '[FILE' : '[URL';
        return `[${i + 1}] ${prefix}: ${c.source}] ${c.excerpt.slice(0, 100)}${c.excerpt.length > 100 ? '...' : ''}`;
      })
      .join('\n');

    const synthesisPrompt = `You are a senior technical writer synthesizing research findings into a comprehensive report.

**Project:** ${title} (${projectSlug})
${goal ? `**Goal:** ${goal}` : ''}
${description ? `**Description:**\n${description}` : ''}

**Research Findings (compressed from parallel sub-topic investigations):**

${compressedFindings}

**Citation Index (${allCitations.length} sources):**
${citationIndex || '(no citations extracted)'}

Write a comprehensive, structured research report. REQUIREMENTS:

1. **Inline citations**: Reference sources using [1], [2], etc. matching the citation index above.
   For code findings, include the file path and line number inline.
2. **Verbatim code excerpts**: Include key code blocks exactly as found, with file paths.
3. **Structure**: Use these exact sections:
   ## Summary
   ## Codebase Findings
   ## Relevant Patterns & Integration Points
   ## External Research
   ## Recommended Approach
   ## Open Questions & Risks
   ## Citations
4. **Citations section**: List all referenced sources at the end.
5. **Be specific**: Every claim should have a citation. Avoid vague generalizations.`;

    const result = await this.queryWithTokenOverflowRecovery(
      synthesisPrompt,
      SYNTHESIS_MODEL,
      cwd,
      10 // Synthesis doesn't need many turns — mostly writing
    );

    return result.text || '';
  }

  // ── Utility Methods ────────────────────────────────────────────────────

  /**
   * Execute a query with token overflow recovery.
   * On overflow, truncates the prompt and retries.
   */
  private async queryWithTokenOverflowRecovery(
    prompt: string,
    model: string,
    cwd: string,
    maxTurns: number,
    retryCount = 0
  ): Promise<{ text: string }> {
    try {
      return await streamingQuery({
        prompt,
        model,
        cwd,
        maxTurns,
        allowedTools: RESEARCH_TOOLS,
        readOnly: false, // WebFetch/WebSearch require this
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTokenOverflow =
        errorMessage.includes('token') ||
        errorMessage.includes('context_length') ||
        errorMessage.includes('too long') ||
        errorMessage.includes('max_tokens');

      if (isTokenOverflow && retryCount < TOKEN_OVERFLOW_MAX_RETRIES) {
        logger.warn(
          `[ResearchAgent] Token overflow detected (attempt ${retryCount + 1}/${TOKEN_OVERFLOW_MAX_RETRIES}), ` +
            `truncating prompt from ${prompt.length} chars`
        );

        // Truncate prompt to ~60% of original
        const truncatedPrompt = prompt.slice(0, Math.floor(prompt.length * 0.6));
        const truncationNote =
          '\n\n[NOTE: Previous context was truncated due to token limits. Focus on the most important findings.]';

        return this.queryWithTokenOverflowRecovery(
          truncatedPrompt + truncationNote,
          model,
          cwd,
          maxTurns,
          retryCount + 1
        );
      }

      throw error;
    }
  }

  /**
   * Extract citations from research text.
   * Looks for [FILE: path:line] and [URL: url] patterns.
   */
  private extractCitations(text: string): Citation[] {
    const citations: Citation[] = [];

    // Extract codebase citations: [FILE: path/to/file.ts:42]
    const filePattern = /\[FILE:\s*([^\]]+)\]/g;
    let match;
    while ((match = filePattern.exec(text)) !== null) {
      const source = match[1].trim();
      // Get surrounding context (next 200 chars or until next citation/section)
      const afterMatch = text.slice(
        match.index + match[0].length,
        match.index + match[0].length + 200
      );
      const excerpt = afterMatch.split(/\n\n|\[FILE:|\[URL:/)[0].trim();
      citations.push({ type: 'codebase', source, excerpt });
    }

    // Extract web citations: [URL: https://...]
    const urlPattern = /\[URL:\s*([^\]]+)\]/g;
    while ((match = urlPattern.exec(text)) !== null) {
      const source = match[1].trim();
      const afterMatch = text.slice(
        match.index + match[0].length,
        match.index + match[0].length + 200
      );
      const excerpt = afterMatch.split(/\n\n|\[FILE:|\[URL:/)[0].trim();
      citations.push({ type: 'web', source, excerpt });
    }

    return citations;
  }

  /**
   * Parse the reflection block from sub-topic findings.
   */
  private parseReflection(text: string): { sufficient: boolean; note: string } {
    const sufficientMatch = text.match(/\*\*Sufficient:\*\*\s*(yes|no)/i);
    const assessmentMatch = text.match(/\*\*Assessment:\*\*\s*(.+?)(?:\n|$)/);

    return {
      sufficient: sufficientMatch ? sufficientMatch[1].toLowerCase() === 'yes' : true,
      note: assessmentMatch ? assessmentMatch[1].trim() : 'No reflection provided.',
    };
  }

  // ── Main Research Pipeline ─────────────────────────────────────────────

  /**
   * Run the full deep research pipeline:
   *
   * 1. Mark researchStatus as 'running'
   * 2. Load project metadata
   * 3. SUPERVISOR: Decompose into 3-5 sub-topics
   * 4. RESEARCHERS: Investigate sub-topics in parallel (with iteration budgets)
   * 5. REFLECTION: Assess sufficiency of findings
   * 6. COMPRESSION: Summarize findings to 25-30% via Haiku
   * 7. SYNTHESIS: Produce final report with Opus (citations, code excerpts)
   * 8. Write research.md, update project, save artifact, emit event
   */
  private async runResearch(projectPath: string, projectSlug: string): Promise<void> {
    logger.info(`[ResearchAgent] Starting deep research for project: ${projectSlug}`);

    // Step 1: Transition researchStatus idle → running
    try {
      await this.projectService.updateProject(projectPath, projectSlug, {
        researchStatus: 'running',
      });
    } catch (err) {
      logger.warn(`[ResearchAgent] Failed to set researchStatus=running for ${projectSlug}:`, err);
    }

    try {
      // Step 2: Load project metadata
      const project = await this.projectService.getProject(projectPath, projectSlug);
      const goal = (project as Record<string, unknown> | null)?.goal as string | undefined;
      const description = (project as Record<string, unknown> | null)?.description as
        | string
        | undefined;
      const title = ((project as Record<string, unknown> | null)?.title as string) ?? projectSlug;

      // Step 3: SUPERVISOR — Decompose into sub-topics
      const subTopics = await this.decomposeIntoSubTopics(
        projectSlug,
        title,
        goal,
        description,
        projectPath
      );
      logger.info(
        `[ResearchAgent] Decomposed into ${subTopics.length} sub-topics: ${subTopics.map((t) => t.id).join(', ')}`
      );

      // Step 4: RESEARCHERS — Investigate each sub-topic in parallel
      const findings = await this.investigateAllSubTopics(
        subTopics,
        projectSlug,
        title,
        projectPath
      );
      logger.info(
        `[ResearchAgent] ${findings.length}/${subTopics.length} sub-topics completed successfully`
      );

      // Step 5: REFLECTION — Assess sufficiency
      const reflection = await this.reflectOnFindings(findings, title, goal, projectPath);
      logger.info(
        `[ResearchAgent] Reflection: sufficient=${reflection.sufficient}, ` +
          `gaps=${reflection.gaps.length}`
      );

      // If insufficient and we have identified gaps, do one more targeted pass
      if (!reflection.sufficient && reflection.gaps.length > 0) {
        logger.info(`[ResearchAgent] Running gap-filling pass for ${reflection.gaps.length} gaps`);
        const gapTopics: SubTopic[] = reflection.gaps.slice(0, 2).map((gap, i) => ({
          id: `gap-${i}`,
          name: `Gap Fill: ${gap.slice(0, 50)}`,
          description: gap,
          searchStrategy: `Address this gap: ${gap}`,
        }));

        const gapFindings = await this.investigateAllSubTopics(
          gapTopics,
          projectSlug,
          title,
          projectPath
        );
        findings.push(...gapFindings);
      }

      // Collect all citations
      const allCitations = findings.flatMap((f) => f.citations);

      // Step 6: COMPRESSION — Summarize findings via Haiku
      const compressedFindings = await this.compressFindings(findings);
      logger.info(`[ResearchAgent] Compressed ${findings.length} sub-topic findings for synthesis`);

      // Step 7: SYNTHESIS — Final report via Opus
      const researchText = await this.synthesizeReport(
        compressedFindings,
        allCitations,
        title,
        projectSlug,
        goal,
        description,
        projectPath
      );
      logger.info(
        `[ResearchAgent] Synthesis complete: ${researchText.length} chars, ` +
          `${allCitations.length} total citations for ${projectSlug}`
      );

      // Step 8: Write research.md
      const researchMdPath = getResearchFilePath(projectPath, projectSlug);
      const researchMdContent =
        `# Research Report: ${title}\n\n` +
        `Generated: ${new Date().toISOString()}\n` +
        `Sub-topics investigated: ${subTopics.length}\n` +
        `Total citations: ${allCitations.length}\n` +
        `Models used: Haiku (compression), Sonnet (research), Opus (synthesis)\n\n` +
        researchText;

      try {
        const dir = researchMdPath.substring(0, researchMdPath.lastIndexOf('/'));
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(researchMdPath, researchMdContent, 'utf-8');
        logger.info(`[ResearchAgent] Wrote research.md to ${researchMdPath}`);
      } catch (writeErr) {
        logger.warn(`[ResearchAgent] Failed to write research.md for ${projectSlug}:`, writeErr);
      }

      // Extract summary section
      const summaryMatch = researchText.match(/## Summary\n([\s\S]*?)(?=\n##|$)/);
      const researchSummary = summaryMatch
        ? summaryMatch[1].trim()
        : researchText.slice(0, 1000).trim();

      // Update project.researchSummary
      try {
        await this.projectService.updateProject(projectPath, projectSlug, {
          researchSummary,
          researchStatus: 'complete',
        });
        logger.info(`[ResearchAgent] Updated researchSummary for ${projectSlug}`);
      } catch (updateErr) {
        logger.warn(
          `[ResearchAgent] Failed to update researchSummary for ${projectSlug}:`,
          updateErr
        );
      }

      // Save research-report artifact
      try {
        const artifactId = await projectArtifactService.saveArtifact(
          projectPath,
          projectSlug,
          'research-report',
          {
            generatedAt: new Date().toISOString(),
            models: {
              summarization: SUMMARIZATION_MODEL,
              research: RESEARCH_MODEL,
              synthesis: SYNTHESIS_MODEL,
            },
            subTopics: subTopics.map((t) => t.name),
            citationCount: allCitations.length,
            reflectionSufficient: reflection.sufficient,
            researchMdPath,
            summary: researchSummary,
            fullReport: researchText,
          }
        );
        logger.info(
          `[ResearchAgent] Saved research-report artifact ${artifactId} for ${projectSlug}`
        );
      } catch (artifactErr) {
        logger.warn(
          `[ResearchAgent] Failed to save research-report artifact for ${projectSlug}:`,
          artifactErr
        );
      }

      // Emit project:research:completed
      this.events.emit('project:research:completed', {
        projectPath,
        slug: projectSlug,
        researchMdPath,
        summary: researchSummary,
        citationCount: allCitations.length,
        subTopicsInvestigated: subTopics.length,
      });

      logger.info(`[ResearchAgent] Deep research complete for project: ${projectSlug}`);
    } catch (error) {
      logger.error(`[ResearchAgent] Research failed for ${projectSlug}:`, error);

      // Mark researchStatus as failed
      try {
        await this.projectService.updateProject(projectPath, projectSlug, {
          researchStatus: 'failed',
        });
      } catch (updateErr) {
        logger.warn(
          `[ResearchAgent] Failed to set researchStatus=failed for ${projectSlug}:`,
          updateErr
        );
      }
    }
  }
}
