/**
 * Research Authority Agent - Deep Project Research AI Agent
 *
 * Responsible for deep research on project goals and codebase:
 * - Triggered by project:lifecycle:launched or explicit project:research:requested events
 * - Understands project goal and description
 * - Searches codebase for related patterns and integration points
 * - Searches web for relevant approaches and libraries
 * - Writes structured findings to research.md
 * - Updates project.researchSummary via ProjectService
 * - Saves research-report artifact via ProjectArtifactService
 * - Emits project:research:completed event
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
import { streamingQuery } from '../../providers/simple-query-service.js';
import { createAgentState, withProcessingGuard, type AgentState } from './agent-utils.js';

const logger = createLogger('ResearchAgent');

/** Model for deep project research */
const RESEARCH_MODEL = resolveModelString('sonnet');

/** Allowed tools for the research session — read-only, no Edit/Write/Bash */
const RESEARCH_TOOLS = ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'];

interface ResearchTriggeredPayload {
  projectPath: string;
  projectSlug: string;
  goal?: string;
  description?: string;
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

  /**
   * Run the full research pipeline for a project:
   * 1. Mark researchStatus as 'running'
   * 2. Load project goal/description
   * 3. Run Claude session with read-only + web tools
   * 4. Write research.md to project directory
   * 5. Update project.researchSummary
   * 6. Save research-report artifact
   * 7. Mark researchStatus as 'complete'
   * 8. Emit project:research:completed
   */
  private async runResearch(projectPath: string, projectSlug: string): Promise<void> {
    logger.info(`[ResearchAgent] Starting research for project: ${projectSlug}`);

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
      const title = (project as Record<string, unknown> | null)?.title as string | undefined;

      const systemPrompt = `You are a senior engineer and researcher conducting deep research for a new software project.

Your goal is to:
1. Understand the project's objective and scope
2. Search the existing codebase for related patterns, services, utilities, and integration points
3. Research the web for relevant libraries, approaches, and best practices
4. Produce a comprehensive, structured research report

Research strategy:
- Start by understanding the project goal and description
- Explore the project structure (package.json, tsconfig, src/ directories)
- Find existing patterns, conventions, and architecture relevant to this project's goals
- Identify files and modules that this project would interact with or extend
- Search the web for industry approaches and relevant libraries
- Note potential technical constraints, dependencies, and risks

Your final output MUST be a structured research report in Markdown with sections:
## Summary
## Codebase Findings
## Relevant Patterns & Integration Points
## External Research
## Recommended Approach
## Open Questions & Risks`;

      const prompt = `Research this project thoroughly and produce a structured research report.

**Project Slug:** ${projectSlug}
**Title:** ${title ?? projectSlug}
${goal ? `**Goal:** ${goal}` : ''}
${description ? `**Description:**\n${description}` : ''}

Search the codebase for relevant patterns and integration points, then search the web for relevant approaches and libraries. Write a comprehensive structured research report.`;

      // Step 3: Run Claude session with read-only + web tools
      logger.info(`[ResearchAgent] Running research session for: ${projectSlug}`);
      const result = await streamingQuery({
        prompt,
        systemPrompt,
        model: RESEARCH_MODEL,
        cwd: projectPath,
        maxTurns: 40,
        allowedTools: RESEARCH_TOOLS,
        readOnly: false, // WebFetch/WebSearch require this to be false
      });

      const researchText = result.text || '';
      logger.info(
        `[ResearchAgent] Research session completed: ${researchText.length} chars for ${projectSlug}`
      );

      // Step 4: Write research.md
      const researchMdPath = getResearchFilePath(projectPath, projectSlug);
      const researchMdContent = `# Research Report: ${title ?? projectSlug}\n\nGenerated: ${new Date().toISOString()}\n\n${researchText}`;

      try {
        const dir = researchMdPath.substring(0, researchMdPath.lastIndexOf('/'));
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(researchMdPath, researchMdContent, 'utf-8');
        logger.info(`[ResearchAgent] Wrote research.md to ${researchMdPath}`);
      } catch (writeErr) {
        logger.warn(`[ResearchAgent] Failed to write research.md for ${projectSlug}:`, writeErr);
      }

      // Extract a concise summary (first ~1000 chars of findings, or the Summary section)
      const summaryMatch = researchText.match(/## Summary\n([\s\S]*?)(?=\n##|$)/);
      const researchSummary = summaryMatch
        ? summaryMatch[1].trim()
        : researchText.slice(0, 1000).trim();

      // Step 5: Update project.researchSummary
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

      // Step 6: Save research-report artifact
      try {
        const artifactId = await projectArtifactService.saveArtifact(
          projectPath,
          projectSlug,
          'research-report',
          {
            generatedAt: new Date().toISOString(),
            model: RESEARCH_MODEL,
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

      // Step 7: Emit project:research:completed
      this.events.emit('project:research:completed', {
        projectPath,
        slug: projectSlug,
        researchMdPath,
        summary: researchSummary,
      });

      logger.info(`[ResearchAgent] Research complete for project: ${projectSlug}`);
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
