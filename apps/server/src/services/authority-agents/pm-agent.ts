/**
 * PM Authority Agent - Product Manager AI Agent
 *
 * First AI executive in the authority hierarchy. Responsible for:
 * - Picking up injected ideas (workItemState='idea')
 * - Researching the codebase to understand context and patterns
 * - Generating SPARC PRDs from research + original idea
 * - Approving ideas or suggesting changes with feedback loop
 * - Transitioning ideas through: idea → pm_review → research → pm_review → approved
 *
 * Pipeline:
 *   1. CTO submits idea (often 1-2 sentences)
 *   2. PM transitions to pm_review, then research state
 *   3. PM researches codebase with read-only tools (haiku, cheap/fast)
 *   4. PM generates SPARC PRD from research findings (sonnet, structured writing)
 *   5. PRD posted to Discord for CTO review
 *   6. Auto-approved → ProjM picks up for decomposition
 *   7. If CTO provides feedback → PM re-reviews with updated description
 *
 * All state transitions go through AuthorityService.submitProposal() so they
 * are subject to policy checks and approval workflows.
 */

import type { Feature } from '@automaker/types';
import type { AuthorityAgent } from '@automaker/types';
import { createLogger, loadContextFiles } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AuditService } from '../audit-service.js';
import { simpleQuery, streamingQuery } from '../../providers/simple-query-service.js';
import {
  createAgentState,
  initializeAgent,
  withProcessingGuard,
  type AgentState,
} from './agent-utils.js';

const logger = createLogger('PMAgent');

/** How long to wait before processing a new idea (debounce) */
const IDEA_PROCESSING_DELAY_MS = 2000;

/** Model for codebase research (cheap/fast exploration) */
const PM_RESEARCH_MODEL = resolveModelString('haiku');

/** Model for SPARC PRD generation (structured writing) */
const PM_PRD_MODEL = resolveModelString('sonnet');

/** Valid complexity values for runtime validation */
const VALID_COMPLEXITIES = new Set(['small', 'medium', 'large', 'architectural']);

interface IdeaInjectedPayload {
  projectPath: string;
  featureId: string;
  title: string;
  description: string;
  injectedBy: string;
  injectedAt: string;
}

/** Result of an AI-powered PRD review */
interface PMReviewResult {
  verdict: 'approve' | 'suggest_changes';
  feedback: string;
  suggestedDescription?: string;
  prd?: string;
  complexity: 'small' | 'medium' | 'large' | 'architectural';
  milestones?: Array<{
    title: string;
    description: string;
  }>;
}

export class PMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly auditService: AuditService | null;

  /** Agent state (agents, initialization, processing tracking) */
  private readonly state: AgentState;

  /** Whether the global event listener has been registered */
  private listenerRegistered = false;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    auditService?: AuditService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.auditService = auditService || null;
    this.state = createAgentState();

    // Register the global idea listener once
    this.registerEventListener();
  }

  /**
   * Register a single global event listener for idea-injected and CTO approval events.
   * Routes to the correct project-specific handler.
   */
  private registerEventListener(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;

    this.events.subscribe((type, payload) => {
      if (type === 'authority:idea-injected') {
        const idea = payload as IdeaInjectedPayload;

        if (!this.state.isInitialized(idea.projectPath)) {
          logger.info(
            `[PMAgent] Auto-initializing for event on uninitialized project: ${idea.projectPath}`
          );
          void (async () => {
            try {
              await this.initialize(idea.projectPath);
              logger.info(`[PMAgent] Auto-initialization successful, processing event`);
              this.handleIdeaInjected(idea);
            } catch (error) {
              logger.error(`[PMAgent] Auto-initialization failed for ${idea.projectPath}:`, error);
            }
          })();
        } else {
          this.handleIdeaInjected(idea);
        }
      }

      // CTO approved an idea after PM suggested changes
      if (type === 'authority:cto-approved-idea') {
        const data = payload as {
          projectPath: string;
          featureId: string;
          updatedDescription?: string;
        };

        if (!this.state.isInitialized(data.projectPath)) {
          logger.warn(
            `[PMAgent] Received cto-approved-idea event for uninitialized project: ${data.projectPath}`
          );
          void (async () => {
            try {
              await this.initialize(data.projectPath);
              await this.handleCTOApproval(
                data.projectPath,
                data.featureId,
                data.updatedDescription
              );
            } catch (error) {
              logger.error(`[PMAgent] Auto-initialization failed for ${data.projectPath}:`, error);
            }
          })();
        } else {
          void this.handleCTOApproval(data.projectPath, data.featureId, data.updatedDescription);
        }
      }

      // User submitted suggestion from Ideation View to PM
      if (type === 'ideation:submit-to-pm') {
        const data = payload as {
          projectPath: string;
          featureId: string;
          suggestion: {
            id: string;
            title: string;
            description: string;
            category: string;
            rationale?: string;
            relatedFiles?: string[];
          };
        };

        if (!this.state.isInitialized(data.projectPath)) {
          logger.info(
            `[PMAgent] Auto-initializing for ideation submission on project: ${data.projectPath}`
          );
          void (async () => {
            try {
              await this.initialize(data.projectPath);
              await this.handleIdeationSubmission(data);
            } catch (error) {
              logger.error(
                `[PMAgent] Auto-initialization failed for ideation submission on ${data.projectPath}:`,
                error
              );
            }
          })();
        } else {
          void this.handleIdeationSubmission(data);
        }
      }

      // User approved PRD from Ideation View
      if (type === 'ideation:prd-approved') {
        const data = payload as {
          projectPath: string;
          featureId: string;
        };

        if (!this.state.isInitialized(data.projectPath)) {
          logger.warn(
            `[PMAgent] Received prd-approved event for uninitialized project: ${data.projectPath}`
          );
          void (async () => {
            try {
              await this.initialize(data.projectPath);
              await this.handleUserApproval(data);
            } catch (error) {
              logger.error(`[PMAgent] Auto-initialization failed for ${data.projectPath}:`, error);
            }
          })();
        } else {
          void this.handleUserApproval(data);
        }
      }
    });
  }

  /**
   * Initialize the PM agent for a project.
   * Registers as an authority agent and starts listening for ideas.
   * Safe to call multiple times - subsequent calls are no-ops.
   */
  async initialize(projectPath: string): Promise<void> {
    await initializeAgent(
      this.state,
      this.authorityService,
      'product-manager',
      projectPath,
      async () => {
        // Scan for any existing unprocessed ideas
        await this.scanForUnprocessedIdeas(projectPath);
      }
    );
  }

  /**
   * Handle a newly injected idea.
   * Debounces processing to avoid rapid-fire API calls.
   */
  private handleIdeaInjected(idea: IdeaInjectedPayload): void {
    if (this.state.isProcessing(idea.featureId)) {
      logger.debug(`Already processing idea ${idea.featureId}, skipping`);
      return;
    }

    logger.info(`New idea received: "${idea.title}" (${idea.featureId})`);

    // Delay slightly to allow for any rapid-fire injections
    setTimeout(() => {
      void this.processIdea(idea.projectPath, idea.featureId);
    }, IDEA_PROCESSING_DELAY_MS);
  }

  /**
   * Scan for features with workItemState='idea' that haven't been processed yet.
   * Also picks up features in 'pm_changes_requested' that may need re-review.
   */
  private async scanForUnprocessedIdeas(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const unprocessedIdeas = features.filter((f) => f.workItemState === 'idea');

      if (unprocessedIdeas.length > 0) {
        logger.info(`Found ${unprocessedIdeas.length} unprocessed ideas on startup`);
        for (const idea of unprocessedIdeas) {
          void this.processIdea(projectPath, idea.id);
        }
      }
    } catch (error) {
      logger.error('Failed to scan for unprocessed ideas:', error);
    }
  }

  /**
   * Process an idea through the PM research + PRD pipeline:
   * 1. Transition idea → pm_review (submit proposal)
   * 2. Transition → research state, explore codebase with haiku
   * 3. Generate SPARC PRD from research + original idea (sonnet)
   * 4. Update feature description with full PRD
   * 5. Emit authority:pm-prd-ready for Discord posting
   * 6. Auto-approve → handleApproval()
   */
  private async processIdea(projectPath: string, featureId: string): Promise<void> {
    return withProcessingGuard(this.state, featureId, async () => {
      try {
        const agent = this.state.getAgent(projectPath);
        if (!agent) {
          logger.error(`PM agent not initialized for project: ${projectPath}`);
          return;
        }

        const feature = await this.featureLoader.get(projectPath, featureId);
        if (!feature) {
          logger.warn(`Feature ${featureId} not found, skipping`);
          return;
        }

        if (feature.workItemState !== 'idea') {
          logger.debug(
            `Feature ${featureId} is not in 'idea' state (${feature.workItemState}), skipping`
          );
          return;
        }

        logger.info(`Processing idea: "${feature.title}" (${featureId})`);

        // Step 1: Propose transition idea → pm_review
        const reviewDecision = await this.authorityService.submitProposal(
          {
            who: agent.id,
            what: 'transition_status',
            target: featureId,
            justification: `PM agent beginning AI-powered review of idea: "${feature.title}"`,
            risk: 'low',
            statusTransition: { from: 'idea', to: 'pm_review' },
          },
          projectPath
        );

        if (reviewDecision.verdict === 'deny') {
          logger.warn(`PM review transition denied for ${featureId}: ${reviewDecision.reason}`);
          return;
        }

        if (reviewDecision.verdict === 'require_approval') {
          logger.info(`PM review transition requires approval for ${featureId}`);
          return;
        }

        // Transition approved - update workItemState
        await this.featureLoader.update(projectPath, featureId, {
          workItemState: 'pm_review',
        });

        this.events.emit('authority:pm-review-started', {
          projectPath,
          featureId,
          agentId: agent.id,
        });

        // Step 2: Transition to research state and explore codebase
        await this.featureLoader.update(projectPath, featureId, {
          workItemState: 'research',
        });

        this.events.emit('authority:pm-research-started', {
          projectPath,
          featureId,
          agentId: agent.id,
        });

        logger.info(`Researching codebase for idea: "${feature.title}"`);
        const researchSummary = await this.researchCodebase(feature, projectPath);

        // Step 3: Generate SPARC PRD from research + original idea
        logger.info(`Generating SPARC PRD for idea: "${feature.title}"`);
        const prdResult = await this.generateSPARCPRD(feature, researchSummary, projectPath);

        // Step 4: Preserve original idea and update feature description with full PRD
        const descriptionHistory = feature.descriptionHistory || [];
        descriptionHistory.push({
          description: feature.description || '',
          timestamp: new Date().toISOString(),
          source: 'enhance' as const,
        });

        await this.featureLoader.update(projectPath, featureId, {
          workItemState: 'pm_review',
          description: prdResult.prd,
          complexity: prdResult.complexity,
          descriptionHistory,
        });

        // Step 5: Emit PRD ready for Discord posting
        this.events.emit('authority:pm-prd-ready', {
          projectPath,
          featureId,
          agentId: agent.id,
          prd: prdResult.prd,
          complexity: prdResult.complexity,
          milestones: prdResult.milestones,
        });

        // Step 6: Auto-approve with full PRD context
        const review: PMReviewResult = {
          verdict: 'approve',
          feedback: 'PM researched codebase and generated SPARC PRD. Auto-approved.',
          prd: prdResult.prd,
          complexity: prdResult.complexity,
          milestones: prdResult.milestones,
        };

        await this.handleApproval(projectPath, featureId, feature, review, agent);
      } catch (error) {
        logger.error(`Failed to process idea ${featureId}:`, error);
        // Reset to 'idea' so the feature can be retried on next scan
        try {
          await this.featureLoader.update(projectPath, featureId, {
            workItemState: 'idea',
          });
        } catch (resetError) {
          logger.error(`Failed to reset state for ${featureId}:`, resetError);
        }
      }
    });
  }

  /**
   * Research the codebase to understand context for an idea.
   * Uses haiku (cheap/fast) with read-only tools to explore project structure,
   * find relevant patterns, and identify existing code to build on.
   */
  private async researchCodebase(feature: Feature, projectPath: string): Promise<string> {
    const title = feature.title || 'Untitled';
    const description = feature.description || '';

    // Load project-specific context rules
    let contextRules = '';
    try {
      const ctx = await loadContextFiles({ projectPath, includeMemory: false });
      contextRules = ctx.formattedPrompt;
    } catch {
      logger.debug('No context files loaded for research');
    }

    const systemPrompt = `You are a senior engineer conducting codebase research for a new feature idea.
${contextRules ? `\n## Project-Specific Rules\n${contextRules}\n` : ''}

Your goal is to explore the project and gather context that will help create a detailed Product Requirements Document (PRD).

Research strategy:
1. Start by finding the project structure (look for package.json, tsconfig, src/ directories)
2. Identify existing patterns, conventions, and architecture relevant to the idea
3. Find files that would need to be modified or that this feature would interact with
4. Note any existing similar functionality that could be extended
5. Identify potential technical constraints or dependencies

Be thorough but efficient. Focus on understanding:
- Where this feature would live in the codebase
- What existing code it would interact with
- Patterns to follow for consistency
- Potential challenges or blockers

Provide a structured research summary at the end.`;

    const prompt = `Research the codebase for this feature idea:

**Title:** ${title}

**Description:**
${description}

Explore the project structure and relevant code, then provide a structured research summary.`;

    try {
      const result = await streamingQuery({
        prompt,
        systemPrompt,
        model: PM_RESEARCH_MODEL,
        cwd: projectPath,
        maxTurns: 30,
        allowedTools: ['Read', 'Glob', 'Grep'],
        readOnly: true,
      });

      if (result.text && result.text.length > 50) {
        logger.info(`Research completed: ${result.text.length} chars of findings`);
        return result.text;
      }

      logger.warn('Research returned minimal results, using original description');
      return `Original idea: ${title}\n\n${description}`;
    } catch (error) {
      logger.error('Codebase research failed, continuing with original description:', error);
      return `Original idea: ${title}\n\n${description}`;
    }
  }

  /**
   * Generate a SPARC PRD from research findings + original idea.
   * Uses sonnet for high-quality structured writing.
   */
  private async generateSPARCPRD(
    feature: Feature,
    researchSummary: string,
    projectPath: string
  ): Promise<{
    prd: string;
    complexity: PMReviewResult['complexity'];
    milestones: Array<{ title: string; description: string }>;
  }> {
    const title = feature.title || 'Untitled';
    const description = feature.description || '';

    // Gather text file contents if attached
    const attachmentContext = (feature.textFilePaths || [])
      .map((f) => `\n--- Attached file: ${f.filename} ---\n${f.content}`)
      .join('\n');

    // Load project-specific context rules
    let contextRules = '';
    try {
      const ctx = await loadContextFiles({ projectPath, includeMemory: false });
      contextRules = ctx.formattedPrompt;
    } catch {
      logger.debug('No context files loaded for PRD generation');
    }

    const systemPrompt = `You are a senior Product Manager creating a SPARC PRD (Product Requirements Document).
${contextRules ? `\n## Project-Specific Rules\n${contextRules}\n` : ''}
SPARC Framework:
- **Situation**: Current state of the system. What exists today?
- **Problem**: What's missing or broken? Why does this matter?
- **Approach**: How will we solve it? Technical approach, key decisions, architecture.
- **Results**: What does success look like? Acceptance criteria, measurable outcomes.
- **Constraints**: Limitations, dependencies, risks, non-goals.

You MUST respond with valid JSON matching this schema:
{
  "prd": "The full SPARC PRD as markdown text",
  "complexity": "small" | "medium" | "large" | "architectural",
  "milestones": [
    { "title": "Milestone name", "description": "What this milestone covers" }
  ]
}

Guidelines:
- Write the PRD in markdown format with clear SPARC sections
- Include specific file paths and code patterns from the research
- Define clear acceptance criteria in the Results section
- Break into logical milestones for iterative delivery
- Be specific and actionable — engineers should be able to implement from this PRD
- Complexity: small (< 1 file), medium (2-5 files), large (5-15 files), architectural (system-wide)`;

    const prompt = `Create a SPARC PRD for this feature:

**Title:** ${title}

**Original Idea:**
${description}${attachmentContext}

**Codebase Research Findings:**
${researchSummary}

Generate a comprehensive SPARC PRD as JSON.`;

    try {
      const result = await simpleQuery({
        prompt,
        systemPrompt,
        model: PM_PRD_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('PRD generation did not return valid JSON, using fallback');
        return this.fallbackPRD(title, description, researchSummary);
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        prd: string;
        complexity: PMReviewResult['complexity'];
        milestones: Array<{ title: string; description: string }>;
      };

      if (!parsed.prd || !parsed.complexity) {
        logger.warn('PRD generation missing required fields, using fallback');
        return this.fallbackPRD(title, description, researchSummary);
      }

      if (!VALID_COMPLEXITIES.has(parsed.complexity)) {
        logger.warn(`Invalid complexity "${parsed.complexity}", defaulting to medium`);
        parsed.complexity = 'medium';
      }

      if (!parsed.milestones || parsed.milestones.length === 0) {
        parsed.milestones = [{ title, description: description.slice(0, 200) }];
      }

      return parsed;
    } catch (error) {
      logger.error('SPARC PRD generation failed, using fallback:', error);
      return this.fallbackPRD(title, description, researchSummary);
    }
  }

  /**
   * Fallback PRD when AI generation fails.
   */
  private fallbackPRD(
    title: string,
    description: string,
    researchSummary: string
  ): {
    prd: string;
    complexity: PMReviewResult['complexity'];
    milestones: Array<{ title: string; description: string }>;
  } {
    const prd = `# ${title}

## Situation
This feature was requested but PRD generation encountered an issue.

## Problem
${description}

## Approach
To be determined after manual review.

## Results
- Feature is implemented as described
- Tests pass

## Constraints
- Needs manual review and refinement

## Research Notes
${researchSummary.slice(0, 1000)}`;

    return {
      prd,
      complexity: 'medium',
      milestones: [{ title, description: description.slice(0, 200) }],
    };
  }

  /**
   * Run AI-powered review of an idea/PRD.
   * Uses Claude to evaluate clarity, feasibility, scope, and missing details.
   */
  private async reviewIdea(feature: Feature, projectPath: string): Promise<PMReviewResult> {
    const title = feature.title || 'Untitled';
    const description = feature.description || '';

    // Gather text file contents if attached
    const attachmentContext = (feature.textFilePaths || [])
      .map((f) => `\n--- Attached file: ${f.filename} ---\n${f.content}`)
      .join('\n');

    const fullDescription = description + attachmentContext;

    const systemPrompt = `You are a senior Product Manager reviewing a Product Requirements Document (PRD) / feature idea.

Your job is to evaluate the idea and either APPROVE it or SUGGEST CHANGES.

Evaluate on these criteria:
1. **Clarity**: Is the description clear enough for engineers to implement?
2. **Feasibility**: Is this technically achievable? Are there obvious blockers?
3. **Scope**: Is the scope appropriate? Not too broad, not too narrow?
4. **Missing Details**: Are acceptance criteria, edge cases, or key requirements missing?
5. **Milestones**: Can this be broken into logical milestones for iterative delivery?

You MUST respond with valid JSON matching this schema:
{
  "verdict": "approve" | "suggest_changes",
  "feedback": "Your detailed feedback explaining the decision",
  "suggestedDescription": "If suggesting changes, provide the improved description here. Omit if approving.",
  "complexity": "small" | "medium" | "large" | "architectural",
  "milestones": [
    { "title": "Milestone name", "description": "What this milestone covers" }
  ]
}

Guidelines:
- APPROVE if the description is clear, scoped, and actionable even if not perfect
- SUGGEST_CHANGES only if there are significant gaps that would block implementation
- Always suggest milestones (even for small features, at least 1 milestone)
- Keep feedback constructive and specific
- The suggestedDescription should be a complete, improved version (not a diff)`;

    const prompt = `Review this feature idea:

**Title:** ${title}

**Description:**
${fullDescription}

Provide your review as JSON.`;

    try {
      const result = await simpleQuery({
        prompt,
        systemPrompt,
        model: PM_PRD_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      // Parse the JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('PM review did not return valid JSON, falling back to approve');
        return this.fallbackReview(feature);
      }

      const parsed = JSON.parse(jsonMatch[0]) as PMReviewResult;

      // Validate required fields
      if (!parsed.verdict || !parsed.feedback || !parsed.complexity) {
        logger.warn('PM review missing required fields, falling back');
        return this.fallbackReview(feature);
      }

      // Ensure milestones exist
      if (!parsed.milestones || parsed.milestones.length === 0) {
        parsed.milestones = [
          {
            title: title,
            description: feature.description || title,
          },
        ];
      }

      return parsed;
    } catch (error) {
      logger.error('AI review failed, falling back to heuristic:', error);
      return this.fallbackReview(feature);
    }
  }

  /**
   * Fallback review when AI is unavailable.
   * Uses simple heuristics (word count, structure) to auto-approve or flag.
   */
  private fallbackReview(feature: Feature): PMReviewResult {
    const description = feature.description || '';
    const title = feature.title || 'Untitled';
    const wordCount = description.split(/\s+/).length;

    // Auto-approve if description has reasonable length and structure
    const hasStructure = /[-*•]|\d+[.)]/.test(description);
    const isDetailed = wordCount > 30;

    let complexity: PMReviewResult['complexity'] = 'small';
    if (wordCount > 500 || /\b(architecture|infrastructure|migration)\b/i.test(description)) {
      complexity = 'architectural';
    } else if (wordCount > 200) {
      complexity = 'large';
    } else if (wordCount > 50) {
      complexity = 'medium';
    }

    if (isDetailed && hasStructure) {
      return {
        verdict: 'approve',
        feedback: 'Auto-approved: Description is detailed and structured.',
        complexity,
        milestones: [{ title, description: description.slice(0, 200) }],
      };
    }

    if (wordCount < 10) {
      return {
        verdict: 'suggest_changes',
        feedback:
          'The description is too brief. Please provide more detail about what needs to be built, acceptance criteria, and expected behavior.',
        suggestedDescription: `## ${title}\n\n**Description:**\n${description}\n\n**TODO: Add the following:**\n- Detailed requirements\n- Acceptance criteria\n- Expected behavior\n- Edge cases to consider`,
        complexity,
        milestones: [{ title, description }],
      };
    }

    return {
      verdict: 'approve',
      feedback: 'Auto-approved via heuristic (AI unavailable).',
      complexity,
      milestones: [{ title, description: description.slice(0, 200) }],
    };
  }

  /**
   * Handle an approved idea: transition to 'approved' state.
   */
  private async handleApproval(
    projectPath: string,
    featureId: string,
    feature: Feature,
    review: PMReviewResult,
    agent: AuthorityAgent
  ): Promise<void> {
    // Propose transition pm_review → approved
    const approvedDecision = await this.authorityService.submitProposal(
      {
        who: agent.id,
        what: 'transition_status',
        target: featureId,
        justification: `PM approved: "${feature.title}". ${review.feedback}`,
        risk: 'low',
        statusTransition: { from: 'pm_review', to: 'approved' },
      },
      projectPath
    );

    if (approvedDecision.verdict === 'deny') {
      logger.warn(`Approved transition denied for ${featureId}: ${approvedDecision.reason}`);
      return;
    }

    if (approvedDecision.verdict === 'require_approval') {
      logger.info(`Approved transition requires CTO approval for ${featureId}`);
      return;
    }

    // Log the approval decision with structured metadata
    if (this.auditService) {
      await this.auditService.logDecision(projectPath, {
        agentId: agent.id,
        role: 'product-manager',
        decisionType: 'prd_approval',
        action: 'approve_prd',
        target: featureId,
        verdict: 'approved',
        reason: review.feedback,
        tags: ['prd', 'approval', review.complexity],
        metadata: {
          featureTitle: feature.title,
          complexity: review.complexity,
          milestones: review.milestones,
          hasPRD: !!review.prd,
        },
      });
    }

    // Transition to approved
    await this.featureLoader.update(projectPath, featureId, {
      workItemState: 'approved',
      complexity: review.complexity,
    });

    this.events.emit('authority:pm-review-approved', {
      projectPath,
      featureId,
      agentId: agent.id,
      feedback: review.feedback,
      prd: review.prd,
      complexity: review.complexity,
      milestones: review.milestones,
    });

    // Also emit research-completed for backward compatibility with ProjM
    this.events.emit('authority:pm-research-completed', {
      projectPath,
      featureId,
      agentId: agent.id,
      analysis: {
        complexity: review.complexity,
        milestones: review.milestones,
      },
    });

    logger.info(`Idea "${feature.title}" approved by PM → ready for decomposition`);
  }

  /**
   * Handle changes requested: transition to 'pm_changes_requested', post feedback.
   */
  private async handleChangesRequested(
    projectPath: string,
    featureId: string,
    feature: Feature,
    review: PMReviewResult,
    agent: AuthorityAgent
  ): Promise<void> {
    // Log the changes-requested decision
    if (this.auditService) {
      await this.auditService.logDecision(projectPath, {
        agentId: agent.id,
        role: 'product-manager',
        decisionType: 'prd_changes_requested',
        action: 'request_prd_changes',
        target: featureId,
        verdict: 'changes_requested',
        reason: review.feedback,
        tags: ['prd', 'changes_requested', review.complexity],
        metadata: {
          featureTitle: feature.title,
          complexity: review.complexity,
          suggestedDescription: review.suggestedDescription,
          milestones: review.milestones,
        },
      });
    }

    // Update feature with PM's suggested improvements
    const updates: Partial<Feature> = {
      workItemState: 'pm_changes_requested' as Feature['workItemState'],
      complexity: review.complexity,
    };

    // Store the PM's suggested description so CTO can see it
    if (review.suggestedDescription) {
      updates.description = review.suggestedDescription;
    }

    await this.featureLoader.update(projectPath, featureId, updates);

    this.events.emit('authority:pm-review-changes-requested', {
      projectPath,
      featureId,
      agentId: agent.id,
      feedback: review.feedback,
      suggestedDescription: review.suggestedDescription,
      complexity: review.complexity,
      milestones: review.milestones,
    });

    logger.info(`PM requested changes for "${feature.title}": ${review.feedback}`);
  }

  /**
   * Handle CTO approval after PM suggested changes.
   * CTO can approve as-is or provide an updated description.
   * Re-runs AI review if description was updated, or proceeds to approval if accepted.
   */
  private async handleCTOApproval(
    projectPath: string,
    featureId: string,
    updatedDescription?: string
  ): Promise<void> {
    return withProcessingGuard(this.state, featureId, async () => {
      try {
        const agent = this.state.getAgent(projectPath);
        if (!agent) return;

        const feature = await this.featureLoader.get(projectPath, featureId);
        if (!feature) return;

        if (feature.workItemState !== 'pm_changes_requested') {
          logger.debug(`Feature ${featureId} not in pm_changes_requested state, skipping`);
          return;
        }

        // If CTO provided an updated description, update the feature and re-review
        if (updatedDescription) {
          await this.featureLoader.update(projectPath, featureId, {
            description: updatedDescription,
            workItemState: 'pm_review',
          });

          // Re-run the review with the updated description
          const updatedFeature = { ...feature, description: updatedDescription };
          const review = await this.reviewIdea(updatedFeature, projectPath);

          if (review.verdict === 'approve') {
            await this.handleApproval(projectPath, featureId, updatedFeature, review, agent);
          } else {
            await this.handleChangesRequested(
              projectPath,
              featureId,
              updatedFeature,
              review,
              agent
            );
          }
        } else {
          // CTO approved PM's suggestion as-is
          const review: PMReviewResult = {
            verdict: 'approve',
            feedback: 'CTO approved PM suggestions.',
            complexity: (feature.complexity as PMReviewResult['complexity']) || 'medium',
            milestones: [
              {
                title: feature.title || 'Untitled',
                description: (feature.description || '').slice(0, 200),
              },
            ],
          };

          await this.featureLoader.update(projectPath, featureId, {
            workItemState: 'pm_review',
          });

          await this.handleApproval(projectPath, featureId, feature, review, agent);
        }
      } catch (error) {
        logger.error(`Failed to handle CTO approval for ${featureId}:`, error);
      }
    });
  }

  /**
   * Handle ideation submission: user submitted suggestion from Ideation View
   * Flow: pending_pm_review → pm_processing → generate PRD → prd_ready (wait for user approval)
   */
  private async handleIdeationSubmission(data: {
    projectPath: string;
    featureId: string;
    suggestion: {
      id: string;
      title: string;
      description: string;
      category: string;
      rationale?: string;
      relatedFiles?: string[];
    };
  }): Promise<void> {
    return withProcessingGuard(this.state, data.featureId, async () => {
      try {
        const agent = this.state.getAgent(data.projectPath);
        if (!agent) {
          logger.error(`PM agent not initialized for project: ${data.projectPath}`);
          return;
        }

        const feature = await this.featureLoader.get(data.projectPath, data.featureId);
        if (!feature) {
          logger.warn(`Feature ${data.featureId} not found, skipping`);
          return;
        }

        if (feature.workItemState !== 'pending_pm_review') {
          logger.debug(
            `Feature ${data.featureId} is not in 'pending_pm_review' state (${feature.workItemState}), skipping`
          );
          return;
        }

        logger.info(`Processing ideation submission: "${feature.title}" (${data.featureId})`);

        // Step 1: Transition to pm_processing
        await this.featureLoader.update(data.projectPath, data.featureId, {
          workItemState: 'pm_processing',
        });

        this.events.emit('authority:pm-review-started', {
          projectPath: data.projectPath,
          featureId: data.featureId,
          agentId: agent.id,
        });

        // Step 2: Generate PRD directly (skip research - suggestion already has context)
        logger.info(`Generating PRD from ideation suggestion: "${feature.title}"`);
        const prdResult = await this.generatePRDFromSuggestion(
          feature,
          data.suggestion,
          data.projectPath
        );

        // Step 3: Update feature with PRD and transition to prd_ready (WAIT for user approval)
        await this.featureLoader.update(data.projectPath, data.featureId, {
          workItemState: 'prd_ready',
          description: prdResult.prd,
          complexity: prdResult.complexity,
          prdMetadata: {
            generatedAt: new Date().toISOString(),
            model: PM_PRD_MODEL,
            originalSuggestion: data.suggestion,
          },
        });

        // Step 4: Emit event to notify user PRD is ready for review
        this.events.emit('ideation:prd-generated', {
          projectPath: data.projectPath,
          featureId: data.featureId,
          title: feature.title,
          prd: prdResult.prd,
          complexity: prdResult.complexity,
          milestones: prdResult.milestones,
          metadata: {
            generatedAt: new Date().toISOString(),
            model: PM_PRD_MODEL,
          },
        });

        logger.info(
          `PRD ready for review: "${feature.title}" - awaiting user approval before decomposition`
        );
      } catch (error) {
        logger.error(`Failed to process ideation submission ${data.featureId}:`, error);
        // Reset to pending_pm_review so it can be retried
        try {
          await this.featureLoader.update(data.projectPath, data.featureId, {
            workItemState: 'pending_pm_review',
          });
        } catch (resetError) {
          logger.error(`Failed to reset state for ${data.featureId}:`, resetError);
        }
      }
    });
  }

  /**
   * Generate PRD from ideation suggestion (skip research phase - suggestion already has context)
   */
  private async generatePRDFromSuggestion(
    feature: Feature,
    suggestion: {
      title: string;
      description: string;
      category: string;
      rationale?: string;
      relatedFiles?: string[];
    },
    projectPath: string
  ): Promise<{
    prd: string;
    complexity: PMReviewResult['complexity'];
    milestones: Array<{ title: string; description: string }>;
  }> {
    const title = suggestion.title;
    const description = suggestion.description;
    const rationale = suggestion.rationale || '';
    const relatedFiles = suggestion.relatedFiles || [];

    // Load project-specific context rules
    let contextRules = '';
    try {
      const ctx = await loadContextFiles({ projectPath, includeMemory: false });
      contextRules = ctx.formattedPrompt;
    } catch {
      logger.debug('No context files loaded for PRD generation');
    }

    const systemPrompt = `You are a senior Product Manager creating a SPARC PRD (Product Requirements Document) from an ideation suggestion.
${contextRules ? `\n## Project-Specific Rules\n${contextRules}\n` : ''}
SPARC Framework:
- **Situation**: Current state of the system. What exists today?
- **Problem**: What's missing or broken? Why does this matter?
- **Approach**: How will we solve it? Technical approach, key decisions, architecture.
- **Results**: What does success look like? Acceptance criteria, measurable outcomes.
- **Constraints**: Limitations, dependencies, risks, non-goals.

You MUST respond with valid JSON matching this schema:
{
  "prd": "The full SPARC PRD as markdown text",
  "complexity": "small" | "medium" | "large" | "architectural",
  "milestones": [
    { "title": "Milestone name", "description": "What this milestone covers" }
  ]
}

Guidelines:
- Write the PRD in markdown format with clear SPARC sections
- Use the suggestion's context (description, rationale, related files) to inform the PRD
- Define clear acceptance criteria in the Results section
- Break into logical milestones for iterative delivery
- Be specific and actionable — engineers should be able to implement from this PRD
- Complexity: small (< 1 file), medium (2-5 files), large (5-15 files), architectural (system-wide)`;

    const relatedFilesContext =
      relatedFiles.length > 0
        ? `\n\n**Related Files:**\n${relatedFiles.map((f) => `- ${f}`).join('\n')}`
        : '';

    const prompt = `Create a SPARC PRD for this ideation suggestion:

**Title:** ${title}

**Description:**
${description}

**Category:** ${suggestion.category}

${rationale ? `**Rationale:**\n${rationale}` : ''}${relatedFilesContext}

Generate a comprehensive SPARC PRD as JSON.`;

    try {
      const result = await simpleQuery({
        prompt,
        systemPrompt,
        model: PM_PRD_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('PRD generation did not return valid JSON, using fallback');
        return this.fallbackPRD(title, description, '');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        prd: string;
        complexity: PMReviewResult['complexity'];
        milestones: Array<{ title: string; description: string }>;
      };

      if (!parsed.prd || !parsed.complexity) {
        logger.warn('PRD generation missing required fields, using fallback');
        return this.fallbackPRD(title, description, '');
      }

      if (!VALID_COMPLEXITIES.has(parsed.complexity)) {
        logger.warn(`Invalid complexity "${parsed.complexity}", defaulting to medium`);
        parsed.complexity = 'medium';
      }

      if (!parsed.milestones || parsed.milestones.length === 0) {
        parsed.milestones = [{ title, description: description.slice(0, 200) }];
      }

      return parsed;
    } catch (error) {
      logger.error('SPARC PRD generation failed, using fallback:', error);
      return this.fallbackPRD(title, description, '');
    }
  }

  /**
   * Handle user approval: user approved PRD from Ideation View
   * Submit proposal to transition prd_ready → approved (triggers ProjM decomposition)
   */
  private async handleUserApproval(data: {
    projectPath: string;
    featureId: string;
  }): Promise<void> {
    return withProcessingGuard(this.state, data.featureId, async () => {
      try {
        const agent = this.state.getAgent(data.projectPath);
        if (!agent) {
          logger.error(`PM agent not initialized for project: ${data.projectPath}`);
          return;
        }

        const feature = await this.featureLoader.get(data.projectPath, data.featureId);
        if (!feature) {
          logger.warn(`Feature ${data.featureId} not found, skipping`);
          return;
        }

        if (feature.workItemState !== 'prd_ready') {
          logger.debug(
            `Feature ${data.featureId} is not in 'prd_ready' state (${feature.workItemState}), skipping`
          );
          return;
        }

        logger.info(`User approved PRD for: "${feature.title}" (${data.featureId})`);

        // Submit proposal to transition prd_ready → approved
        const approvedDecision = await this.authorityService.submitProposal(
          {
            who: agent.id,
            what: 'transition_status',
            target: data.featureId,
            justification: `User approved PRD from Ideation View for: "${feature.title}"`,
            risk: 'low',
            statusTransition: { from: 'prd_ready', to: 'approved' },
          },
          data.projectPath
        );

        if (approvedDecision.verdict === 'deny') {
          logger.warn(
            `Approved transition denied for ${data.featureId}: ${approvedDecision.reason}`
          );
          return;
        }

        if (approvedDecision.verdict === 'require_approval') {
          logger.info(`Approved transition requires approval for ${data.featureId}`);
          return;
        }

        // Transition to approved
        await this.featureLoader.update(data.projectPath, data.featureId, {
          workItemState: 'approved',
        });

        // Emit event to trigger ProjM decomposition
        this.events.emit('authority:pm-review-approved', {
          projectPath: data.projectPath,
          featureId: data.featureId,
          agentId: agent.id,
          feedback: 'User approved PRD from Ideation View',
          prd: feature.description,
          complexity: feature.complexity,
          milestones: feature.prdMetadata?.originalSuggestion
            ? [
                {
                  title: feature.title || 'Untitled',
                  description: feature.description?.slice(0, 200) || '',
                },
              ]
            : [],
        });

        logger.info(`PRD approved by user: "${feature.title}" → ready for ProjM decomposition`);
      } catch (error) {
        logger.error(`Failed to handle user approval for ${data.featureId}:`, error);
      }
    });
  }

  /**
   * Get the registered agent for a project.
   */
  getAgent(projectPath: string): AuthorityAgent | null {
    return this.state.getAgent(projectPath);
  }
}
