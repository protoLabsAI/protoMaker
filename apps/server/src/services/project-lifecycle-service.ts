/**
 * Project Lifecycle Service
 *
 * Orchestrates the full project lifecycle:
 * idea -> dedup -> PRD -> review -> milestones -> features -> auto-mode
 */

import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  LifecycleInitiateResult,
  LifecycleApproveResult,
  LifecycleLaunchResult,
  LifecycleStatus,
  Milestone,
  Project,
  ProjectLifecyclePhase,
} from '@protolabsai/types';
import { createLogger, slugify } from '@protolabsai/utils';
import { resolveModelString } from '@protolabsai/model-resolver';
import { getResearchFilePath } from '@protolabsai/platform';
import type { SettingsService } from './settings-service.js';
import type { ProjectService } from './project-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import { orchestrateProjectFeatures } from './project-orchestration-service.js';
import type { EventEmitter } from '../lib/events.js';
import { streamingQuery } from '../providers/simple-query-service.js';

const execAsync = promisify(exec);
const logger = createLogger('ProjectLifecycle');

/** Model used for deep project research */
const RESEARCH_MODEL = resolveModelString('sonnet');

/** Allowed tools for research sessions — read-only + web search */
const RESEARCH_TOOLS = ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'];

export class ProjectLifecycleService {
  constructor(
    private settingsService: SettingsService,
    private projectService: ProjectService,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private events: EventEmitter
  ) {
    this.registerResearchListener();
  }

  /**
   * Register event listener to auto-trigger research on project initiation
   * when researchOnCreate flag is set in the initiate payload.
   */
  private registerResearchListener(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'project:lifecycle:initiated') {
        const data = payload as {
          projectPath?: string;
          slug?: string;
          researchOnCreate?: boolean;
        };

        if (!data.researchOnCreate || !data.projectPath || !data.slug) return;

        // Fire-and-forget: check project state then trigger research
        void (async () => {
          try {
            const project = await this.projectService.getProject(data.projectPath!, data.slug!);
            if (!project || project.researchStatus !== 'idle') return;

            await this.research(data.projectPath!, data.slug!);
          } catch (err) {
            logger.warn(`[ProjectLifecycle] Auto-trigger research failed for ${data.slug}:`, err);
          }
        })();
      }
    });
  }

  /**
   * Initiate a project: create local project entry
   */
  async initiate(
    projectPath: string,
    title: string,
    ideaDescription: string,
    options?: { researchOnCreate?: boolean }
  ): Promise<LifecycleInitiateResult> {
    const localSlug = slugify(title);

    // Create local project — set researchStatus to 'idle' when researchOnCreate requested
    await this.projectService.createProject(projectPath, {
      slug: localSlug,
      title,
      goal: ideaDescription,
      researchStatus: options?.researchOnCreate ? 'idle' : undefined,
    });

    this.events.emit('project:lifecycle:initiated', {
      projectPath,
      slug: localSlug,
      title,
      hasDuplicates: false,
      researchOnCreate: options?.researchOnCreate ?? false,
    });

    logger.info(`Initiated project: ${title}`);

    return {
      duplicates: [],
      localSlug,
      hasDuplicates: false,
    };
  }

  /**
   * Save structured milestone data parsed from PM agent PRD output.
   *
   * This bridges the gap between PM agent PRD generation and approve_project.
   * Call this after the PM agent drafts the PRD to persist milestones so
   * approve_project_prd can find them.
   */
  async saveMilestones(
    projectPath: string,
    projectSlug: string,
    milestones: Milestone[]
  ): Promise<Project> {
    return this.projectService.saveProjectMilestones(projectPath, projectSlug, milestones);
  }

  /**
   * Approve PRD: create features from milestones
   */
  async approvePrd(
    projectPath: string,
    projectSlug: string,
    options?: {
      createEpics?: boolean;
      setupDependencies?: boolean;
    }
  ): Promise<LifecycleApproveResult> {
    const project = await this.projectService.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    if (!project.milestones || project.milestones.length === 0) {
      throw new Error('Project has no milestones. Generate a PRD first.');
    }

    // Create board features from project milestones
    const result = await orchestrateProjectFeatures(
      project,
      {
        projectPath,
        projectSlug,
        createEpics: options?.createEpics ?? true,
        setupDependencies: options?.setupDependencies ?? true,
        initialStatus: 'backlog',
      },
      this.featureLoader,
      this.events
    );

    // Push epic branches to remote so child features can branch from them.
    // Each epic branch is created from origin/dev HEAD. If the branch already
    // exists on the remote, the push is a no-op (error is swallowed).
    const epicBranchNames =
      Object.values(result.milestoneEpicMap).length > 0
        ? await this.getEpicBranchNames(projectPath, result.milestoneEpicMap)
        : [];

    for (const epicBranch of epicBranchNames) {
      try {
        await execAsync(`git push origin origin/dev:refs/heads/${epicBranch}`, {
          cwd: projectPath,
        });
        logger.info(`Pushed epic branch to remote: ${epicBranch}`);
      } catch (err) {
        // Branch may already exist on the remote — this is expected and safe to ignore
        logger.debug(`Epic branch push skipped (may already exist): ${epicBranch}`, err);
      }
    }

    await this.projectService.updateProject(projectPath, projectSlug, {
      status: 'active',
    });

    this.events.emit('project:lifecycle:prd-approved', {
      projectPath,
      slug: projectSlug,
      featuresCreated: result.featuresCreated,
      epicsCreated: Object.keys(result.milestoneEpicMap).length,
    });

    logger.info(`Approved PRD for ${projectSlug}: ${result.featuresCreated} features`);

    return {
      featuresCreated: result.featuresCreated,
      epicsCreated: Object.keys(result.milestoneEpicMap).length,
    };
  }

  /**
   * Resolve epic feature IDs to their branch names via the feature loader.
   */
  private async getEpicBranchNames(
    projectPath: string,
    milestoneEpicMap: Record<string, string>
  ): Promise<string[]> {
    const branchNames: string[] = [];
    for (const epicId of Object.values(milestoneEpicMap)) {
      try {
        const epicFeature = await this.featureLoader.get(projectPath, epicId);
        if (epicFeature?.branchName) {
          branchNames.push(epicFeature.branchName);
        }
      } catch {
        logger.warn(`Failed to load epic feature ${epicId} for branch push`);
      }
    }
    return branchNames;
  }

  /**
   * Launch project: start auto-mode
   */
  async launch(
    projectPath: string,
    projectSlug: string,
    maxConcurrency?: number
  ): Promise<LifecycleLaunchResult> {
    const project = await this.projectService.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    // Count backlog features
    const features = await this.featureLoader.getAll(projectPath);
    const backlogFeatures = features.filter((f) => f.status === 'backlog');

    if (backlogFeatures.length === 0) {
      throw new Error('No features in backlog. Approve the PRD first to create features.');
    }

    // Generate QA checklist doc (best-effort — never fails the launch)
    try {
      await this.generateQaDoc(projectPath, projectSlug, project);
    } catch (err) {
      logger.warn(`[ProjectLifecycle] Failed to generate QA doc for ${projectSlug}:`, err);
    }

    // Start auto-mode
    let autoModeStarted = false;
    try {
      await this.autoModeService.startAutoLoopForProject(projectPath, null, maxConcurrency);
      autoModeStarted = true;
    } catch (error) {
      logger.warn('Failed to start auto-mode:', error);
    }

    this.events.emit('project:lifecycle:launched', {
      projectPath,
      projectSlug,
      featuresInBacklog: backlogFeatures.length,
      autoModeStarted,
    });

    logger.info(
      `Launched project ${projectSlug}: ${backlogFeatures.length} features, auto-mode=${autoModeStarted}`
    );

    return {
      autoModeStarted,
      featuresInBacklog: backlogFeatures.length,
    };
  }

  /**
   * Trigger deep research for a project.
   *
   * Delegates to the ResearchAgent pipeline:
   * - Updates researchStatus to 'running'
   * - Runs a Claude session with read-only + web tools
   * - Writes research.md to the project directory
   * - Updates project.researchSummary
   * - Emits project:research:completed
   *
   * Returns { started: true } immediately; research runs asynchronously.
   */
  async research(projectPath: string, projectSlug: string): Promise<{ started: true }> {
    const project = await this.projectService.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    // Don't start if already running
    if (project.researchStatus === 'running') {
      logger.info(`[ProjectLifecycle] Research already in progress for ${projectSlug}`);
      return { started: true };
    }

    // Fire-and-forget the research pipeline
    void this.runResearch(projectPath, projectSlug, project);

    return { started: true };
  }

  /**
   * Run the full research pipeline asynchronously.
   * Called by research() — not intended for direct use.
   */
  private async runResearch(
    projectPath: string,
    projectSlug: string,
    project: Project
  ): Promise<void> {
    logger.info(`[ProjectLifecycle] Starting research for project: ${projectSlug}`);

    // Step 1: Mark researchStatus as running
    try {
      await this.projectService.updateProject(projectPath, projectSlug, {
        researchStatus: 'running',
      });
    } catch (err) {
      logger.warn(
        `[ProjectLifecycle] Failed to set researchStatus=running for ${projectSlug}:`,
        err
      );
    }

    try {
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

Your final output MUST be a structured research report in Markdown with these sections:
## Summary
## Codebase Findings
## Relevant Patterns & Integration Points
## External Research
## Recommended Approach
## Open Questions & Risks`;

      const prompt = `Research this project thoroughly and produce a structured research report.

**Project Slug:** ${projectSlug}
**Title:** ${project.title}
${project.goal ? `**Goal:** ${project.goal}` : ''}

Search the codebase for relevant patterns and integration points, then research the web for relevant approaches and libraries. Write a comprehensive structured research report.`;

      // Step 2: Run Claude session with read-only + web tools
      logger.info(`[ProjectLifecycle] Running research session for: ${projectSlug}`);
      const result = await streamingQuery({
        prompt,
        systemPrompt,
        model: RESEARCH_MODEL,
        cwd: projectPath,
        maxTurns: 40,
        allowedTools: RESEARCH_TOOLS,
      });

      const researchText = result.text || '';
      logger.info(
        `[ProjectLifecycle] Research session completed: ${researchText.length} chars for ${projectSlug}`
      );

      // Step 3: Write research.md
      const researchMdPath = getResearchFilePath(projectPath, projectSlug);
      try {
        await fs.mkdir(path.dirname(researchMdPath), { recursive: true });
        await fs.writeFile(
          researchMdPath,
          `# Research Report: ${project.title}\n\nGenerated: ${new Date().toISOString()}\n\n${researchText}`,
          'utf-8'
        );
        logger.info(`[ProjectLifecycle] Wrote research.md to ${researchMdPath}`);
      } catch (writeErr) {
        logger.warn(`[ProjectLifecycle] Failed to write research.md for ${projectSlug}:`, writeErr);
      }

      // Step 4: Extract summary and update project
      const summaryMatch = researchText.match(/## Summary\n([\s\S]*?)(?=\n##|$)/);
      const researchSummary = summaryMatch
        ? summaryMatch[1].trim()
        : researchText.slice(0, 1000).trim();

      await this.projectService.updateProject(projectPath, projectSlug, {
        researchSummary,
        researchStatus: 'complete',
      });
      logger.info(`[ProjectLifecycle] Updated researchSummary for ${projectSlug}`);

      // Step 5: Emit completion event
      this.events.emit('project:research:completed', {
        projectPath,
        slug: projectSlug,
        researchMdPath,
        summary: researchSummary,
      });

      logger.info(`[ProjectLifecycle] Research complete for project: ${projectSlug}`);
    } catch (error) {
      logger.error(`[ProjectLifecycle] Research failed for ${projectSlug}:`, error);

      // Mark as failed
      await this.projectService
        .updateProject(projectPath, projectSlug, { researchStatus: 'failed' })
        .catch(() => {});
    }
  }

  /**
   * Generate a QA Checklist document from milestone/phase acceptance criteria.
   * Idempotent: skips creation if a doc titled 'QA Checklist' already exists.
   */
  private async generateQaDoc(
    projectPath: string,
    projectSlug: string,
    project: Project
  ): Promise<void> {
    // Idempotency check — skip if already exists
    const docsFile = await this.projectService.listDocs(projectPath, projectSlug);
    const alreadyExists = Object.values(docsFile.docs).some((d) => d.title === 'QA Checklist');
    if (alreadyExists) {
      logger.info(`[ProjectLifecycle] QA Checklist already exists for ${projectSlug}, skipping`);
      return;
    }

    const milestones = project.milestones ?? [];

    // Build markdown checklist from phases that have acceptance criteria
    let hasAnyCriteria = false;
    const lines: string[] = [`# QA Checklist — ${project.title}`];

    for (const [milestoneIndex, milestone] of milestones.entries()) {
      const milestoneNumber = milestone.number ?? milestoneIndex + 1;
      const phasesWithCriteria = (milestone.phases ?? []).filter(
        (p) => p.acceptanceCriteria && p.acceptanceCriteria.length > 0
      );

      if (phasesWithCriteria.length === 0) continue;

      lines.push(`## Milestone ${milestoneNumber}: ${milestone.title}`);

      for (const [phaseIndex, phase] of phasesWithCriteria.entries()) {
        const phaseNumber = phase.number ?? phaseIndex + 1;
        lines.push(`### Phase ${phaseNumber}: ${phase.title}`);

        if (phase.description) {
          lines.push(`> ${phase.description}`);
        }

        lines.push('');

        for (const criterion of phase.acceptanceCriteria!) {
          lines.push(`- [ ] ${criterion}`);
          hasAnyCriteria = true;
        }

        lines.push('');
      }
    }

    if (!hasAnyCriteria) {
      lines.push('_No acceptance criteria found in milestones._');
    }

    const content = lines.join('\n');

    await this.projectService.createDoc(projectPath, projectSlug, 'QA Checklist', content);
    logger.info(`[ProjectLifecycle] Created QA Checklist for ${projectSlug}`);
  }

  /**
   * Get lifecycle status: read local state
   */
  async getStatus(projectPath: string, projectSlug: string): Promise<LifecycleStatus> {
    const project = await this.projectService.getProject(projectPath, projectSlug);

    // Determine board state (count all statuses including blocked/verified)
    const features = await this.featureLoader.getAll(projectPath);
    const boardSummary = {
      backlog: features.filter((f) => f.status === 'backlog').length,
      inProgress: features.filter((f) => f.status === 'in_progress').length,
      review: features.filter((f) => f.status === 'review').length,
      done: features.filter((f) => f.status === 'done' || f.status === 'verified').length,
    };
    const blockedCount = features.filter((f) => f.status === 'blocked').length;

    const hasFeatures = features.length > 0;
    const hasPrd = !!project?.prd;
    const hasMilestones = (project?.milestones?.length ?? 0) > 0;
    const allDone =
      hasFeatures &&
      boardSummary.backlog === 0 &&
      boardSummary.inProgress === 0 &&
      boardSummary.review === 0 &&
      blockedCount === 0 &&
      boardSummary.done > 0;

    // Determine phase
    let phase: ProjectLifecyclePhase | 'unknown' = 'unknown';
    const nextActions: string[] = [];

    if (!project) {
      phase = 'unknown';
      nextActions.push('initiate_project');
    } else if (project.status === 'completed' || allDone) {
      phase = 'completed';
    } else if (hasFeatures && boardSummary.backlog > 0) {
      phase = 'prd-approved';
      nextActions.push('launch_project');
    } else if (hasFeatures && (boardSummary.inProgress > 0 || boardSummary.review > 0)) {
      phase = 'started';
    } else if (hasMilestones && !hasFeatures) {
      phase = 'prd-approved';
      nextActions.push('approve_project_prd');
    } else if (hasPrd && !hasMilestones) {
      phase = 'idea-approved';
      nextActions.push('approve_project_prd');
    } else {
      // Project exists but has no PRD yet -- suggest generating one
      phase = 'idea';
      nextActions.push('generate_project_prd');
    }

    return {
      phase,
      nextActions,
      boardSummary,
      hasPrd,
      hasMilestones,
      hasFeatures,
    };
  }
}
