/**
 * ProjM Authority Agent - Project Manager AI Agent
 *
 * Responsible for the "when & how" of feature execution with milestone-gated delivery:
 * - Monitors features in 'approved' state (approved by PM after CTO review)
 * - Creates a Project with milestones from PM's analysis
 * - Milestone-gated execution: only plans one milestone at a time
 * - On milestone completion: plans next milestone, notifies CTO
 * - Decomposes phases into implementable child features
 * - Sets up dependencies between tasks
 * - Transitions features: approved → planned → ready
 *
 * Milestone lifecycle:
 *   stub → planning → planned → in-progress → completed
 *   Only one milestone is 'in-progress' at a time (sequential by default).
 *   Milestones 2+ stay as 'stub' until the previous one completes.
 *
 * All actions go through AuthorityService.submitProposal().
 */

import type { Feature, Milestone, MilestoneStatus, PipelinePhase } from '@automaker/types';
import type { AuthorityAgent } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { ProjectService } from '../project-service.js';
import { simpleQuery } from '../../providers/simple-query-service.js';
import { resolveModelString } from '@automaker/model-resolver';
import {
  createAgentState,
  initializeAgent,
  withProcessingGuard,
  type AgentState,
  type PhaseProcessor,
} from './agent-utils.js';

const logger = createLogger('ProjMAgent');

/** Polling interval for checking planned/approved features and milestone completion */
const POLL_INTERVAL_MS = 15_000;

/** Model used for milestone planning */
const PLANNING_MODEL = resolveModelString('sonnet');

/** Custom state for ProjM agent */
interface ProjMCustomState {
  pollTimers: Map<string, ReturnType<typeof setInterval>>;
}

export class ProjMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly projectService: ProjectService;

  /** Agent state (agents, initialization, processing tracking, poll timers) */
  private readonly state: AgentState<ProjMCustomState>;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    projectService: ProjectService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.projectService = projectService;
    this.state = createAgentState<ProjMCustomState>({
      pollTimers: new Map(),
    });

    // Listen for PM approval events (features moving to 'approved')
    this.events.subscribe((type, payload) => {
      if (type === 'authority:pm-review-approved') {
        logger.info('Received authority:pm-review-approved event', payload);
        const data = payload as {
          projectPath: string;
          featureId: string;
          milestones?: Array<{ title: string; description: string }>;
          complexity?: string;
        };

        // Auto-initialize if not already initialized
        if (!this.state.isInitialized(data.projectPath)) {
          logger.info(`Auto-initializing for event on uninitialized project: ${data.projectPath}`);
          void (async () => {
            try {
              await this.initialize(data.projectPath);
              logger.info(`[ProjMAgent] Auto-initialization successful, processing event`);
              await this.handleApprovedIdea(data);
            } catch (error) {
              logger.error(
                `[ProjMAgent] Auto-initialization failed for ${data.projectPath}:`,
                error
              );
            }
          })();
        } else {
          void this.handleApprovedIdea(data);
        }
      }

      // Also listen for legacy pm-epic-created and pm-research-completed for backward compat
      if (type === 'authority:pm-epic-created') {
        const data = payload as { projectPath: string; featureId?: string; epicId?: string };

        if (!this.state.isInitialized(data.projectPath)) {
          logger.warn(
            `[ProjMAgent] Received pm-epic-created event for uninitialized project: ${data.projectPath}`
          );
          void (async () => {
            try {
              await this.initialize(data.projectPath);
              await this.scanForPlannedFeatures(data.projectPath);
            } catch (error) {
              logger.error(
                `[ProjMAgent] Auto-initialization failed for ${data.projectPath}:`,
                error
              );
            }
          })();
        } else {
          void this.scanForPlannedFeatures(data.projectPath);
        }
      }
    });
  }

  /**
   * Initialize the ProjM agent for a project.
   */
  async initialize(projectPath: string): Promise<void> {
    await initializeAgent(
      this.state,
      this.authorityService,
      'project-manager',
      projectPath,
      async () => {
        // Scan for existing approved/planned features
        await this.scanForApprovedFeatures(projectPath);
        await this.scanForPlannedFeatures(projectPath);

        // Start periodic polling for planned feature scanning
        // (Milestone completion is now handled by CompletionDetectorService)
        const timer = setInterval(() => {
          void this.scanForPlannedFeatures(projectPath);
        }, POLL_INTERVAL_MS);
        this.state.custom.pollTimers.set(projectPath, timer);
      }
    );
  }

  /**
   * Stop the ProjM agent for a project.
   */
  stop(projectPath: string): void {
    const timer = this.state.custom.pollTimers.get(projectPath);
    if (timer) {
      clearInterval(timer);
      this.state.custom.pollTimers.delete(projectPath);
    }
    this.state.removeInitialized(projectPath);
    logger.info(`ProjM agent stopped for project: ${projectPath}`);
  }

  /**
   * Handle a newly approved idea: create a Project with milestone stubs.
   * Only the first milestone gets fully planned; the rest are stubs.
   */
  private async handleApprovedIdea(data: {
    projectPath: string;
    featureId: string;
    milestones?: Array<{ title: string; description: string }>;
    complexity?: string;
  }): Promise<void> {
    const { projectPath, featureId, milestones } = data;
    return withProcessingGuard(this.state, featureId, async () => {
      try {
        const agent = this.state.getAgent(projectPath);
        if (!agent) {
          logger.error(
            `No agent registered for project ${projectPath}. Cannot process approved idea.`
          );
          return;
        }

        logger.debug(`Agent found for ${projectPath}: ${agent.id}`);

        const feature = await this.featureLoader.get(projectPath, featureId);
        if (!feature || feature.workItemState !== 'approved') {
          logger.warn('Feature not approved or not found', {
            featureId,
            workItemState: feature?.workItemState,
          });
          return;
        }

        logger.info(`Creating project for approved idea: "${feature.title}"`);

        // Submit proposal to create project
        const decision = await this.authorityService.submitProposal(
          {
            who: agent.id,
            what: 'create_work',
            target: featureId,
            justification: `Creating project with milestone-gated execution for "${feature.title}"`,
            risk: 'low',
          },
          projectPath
        );

        if (decision.verdict !== 'allow') {
          logger.warn(`Project creation not allowed for ${featureId}: ${decision.reason}`);
          return;
        }

        // Build milestone stubs from PM analysis
        const milestoneInputs = milestones?.length
          ? milestones.map((m, i) => ({
              title: m.title,
              description: m.description,
              // Only first milestone gets phases planned
              phases:
                i === 0
                  ? [] // Will be filled by planning below
                  : [],
            }))
          : [
              {
                title: feature.title || 'Implementation',
                description: feature.description || '',
                phases: [] as Array<{ title: string; description: string }>,
              },
            ];

        // Create the project with milestone stubs
        const slug = this.generateSlug(feature.title || 'feature');

        const project = await this.projectService.createProject(projectPath, {
          slug,
          title: feature.title || 'Untitled Project',
          goal: feature.description || '',
          milestones: milestoneInputs,
        });

        // Link the original feature to this project
        await this.featureLoader.update(projectPath, featureId, {
          projectSlug: project.slug,
          isEpic: true,
          epicColor: '#6366f1',
        });

        // Set milestone statuses: first = 'planning', rest = 'stub'
        for (let i = 0; i < project.milestones.length; i++) {
          project.milestones[i].status = i === 0 ? 'planning' : ('stub' as MilestoneStatus);
        }
        await this.projectService.updateProject(projectPath, project.slug, {
          status: 'active',
        });

        // Emit milestone planning started for M1
        if (project.milestones.length > 0) {
          this.events.emit('milestone:planning-started', {
            projectPath,
            projectTitle: project.title,
            projectSlug: project.slug,
            milestoneTitle: project.milestones[0].title,
            milestoneNumber: 1,
          });
        }

        // Plan the first milestone in detail
        await this.planMilestone(projectPath, project.slug, 0, feature);

        logger.info(
          `Project "${project.slug}" created with ${project.milestones.length} milestones`
        );
      } catch (error) {
        logger.error(`Failed to create project for ${featureId}:`, error);
      }
    });
  }

  /**
   * Plan a specific milestone: use AI to generate detailed phases, then create features.
   */
  private async planMilestone(
    projectPath: string,
    projectSlug: string,
    milestoneIndex: number,
    parentFeature: Feature
  ): Promise<void> {
    const project = await this.projectService.getProject(projectPath, projectSlug);
    if (!project || milestoneIndex >= project.milestones.length) return;

    const milestone = project.milestones[milestoneIndex];
    logger.info(`Planning milestone ${milestoneIndex + 1}: "${milestone.title}"`);

    // Use AI to generate detailed phases for this milestone
    const phases = await this.generatePhasesForMilestone(
      milestone,
      project,
      parentFeature,
      projectPath
    );

    // Update the milestone with generated phases
    milestone.phases = phases.map((p, i) => ({
      number: i + 1,
      name: this.generateSlug(p.title),
      title: p.title,
      description: p.description,
      filesToModify: p.filesToModify,
      acceptanceCriteria: p.acceptanceCriteria,
      complexity: p.complexity,
    }));
    milestone.status = 'planned' as MilestoneStatus;

    // Save updated project
    await this.projectService.updateProject(projectPath, projectSlug, {
      status: project.status,
    });

    // Emit milestone planned event
    this.events.emit('milestone:planned', {
      projectPath,
      projectTitle: project.title,
      projectSlug,
      milestoneTitle: milestone.title,
      milestoneNumber: milestoneIndex + 1,
      phaseCount: phases.length,
    });

    // Create features for this milestone's phases
    await this.createMilestoneFeatures(
      projectPath,
      projectSlug,
      milestone,
      milestoneIndex,
      parentFeature.id
    );

    // Transition milestone to in-progress
    milestone.status = 'in-progress';
    await this.projectService.updateProject(projectPath, projectSlug, {
      status: project.status,
    });

    this.events.emit('milestone:started', {
      projectPath,
      projectTitle: project.title,
      projectSlug,
      milestoneTitle: milestone.title,
      milestoneNumber: milestoneIndex + 1,
    });
  }

  /**
   * Use AI to generate detailed phases for a milestone.
   */
  private async generatePhasesForMilestone(
    milestone: Milestone,
    project: { title: string; goal: string },
    parentFeature: Feature,
    projectPath: string
  ): Promise<
    Array<{
      title: string;
      description: string;
      filesToModify?: string[];
      acceptanceCriteria?: string[];
      complexity?: 'small' | 'medium' | 'large';
    }>
  > {
    // If milestone already has phases with descriptions, use them
    if (milestone.phases.length > 0 && milestone.phases[0].description) {
      return milestone.phases;
    }

    const systemPrompt = `You are a project manager decomposing a milestone into implementable phases.

Each phase should be a concrete, implementable unit of work. Respond with valid JSON:
{
  "phases": [
    {
      "title": "Phase title",
      "description": "Detailed description of what to implement",
      "filesToModify": ["path/to/file.ts"],
      "acceptanceCriteria": ["Criteria 1", "Criteria 2"],
      "complexity": "small" | "medium" | "large"
    }
  ]
}

Guidelines:
- Each phase should take 30-60 minutes of focused AI agent work
- Phases should be ordered by dependency — critical-path blockers FIRST
- Be specific about what files to modify and what changes to make
- Include clear acceptance criteria that are machine-verifiable (build passes, tests pass)

Anti-patterns to AVOID:
- NEVER create multiple phases that modify the same file — this causes merge conflicts when agents work in parallel
- NEVER decompose type definitions, interfaces, or config into a separate phase from the code that uses them — combine them into one phase
- NEVER create phases smaller than ~100 lines of meaningful code changes — merge them with adjacent phases
- NEVER put critical-path fixes (race conditions, blockers) late in the plan — they must be Phase 1
- Aim for 3-5 phases per milestone, not 6+. Fewer, larger phases are better than many tiny ones.

File contention rule: Before finalizing, check if any file appears in filesToModify for 2+ phases.
If so, consolidate those phases or sequence them strictly. Parallel agents on the same file = guaranteed merge conflicts.`;

    const prompt = `Project: ${project.title}
Goal: ${project.goal}

Milestone: ${milestone.title}
Description: ${milestone.description}

Parent feature description:
${(parentFeature.description || '').slice(0, 2000)}

Decompose this milestone into implementable phases.`;

    try {
      const result = await simpleQuery({
        prompt,
        systemPrompt,
        model: PLANNING_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackPhases(milestone);
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        phases: Array<{
          title: string;
          description: string;
          filesToModify?: string[];
          acceptanceCriteria?: string[];
          complexity?: 'small' | 'medium' | 'large';
        }>;
      };

      if (!parsed.phases?.length) {
        return this.fallbackPhases(milestone);
      }

      return parsed.phases;
    } catch (error) {
      logger.error('AI phase planning failed, using fallback:', error);
      return this.fallbackPhases(milestone);
    }
  }

  /**
   * Fallback phase generation when AI is unavailable.
   */
  private fallbackPhases(milestone: Milestone): Array<{
    title: string;
    description: string;
    complexity?: 'small' | 'medium' | 'large';
  }> {
    return [
      {
        title: milestone.title,
        description: milestone.description || `Implement ${milestone.title}`,
        complexity: 'medium',
      },
    ];
  }

  /**
   * Create features on the board for a milestone's phases.
   */
  private async createMilestoneFeatures(
    projectPath: string,
    projectSlug: string,
    milestone: Milestone,
    milestoneIndex: number,
    epicId: string
  ): Promise<void> {
    const createdIds: string[] = [];

    for (const phase of milestone.phases) {
      const feature = await this.featureLoader.create(projectPath, {
        title: phase.title,
        description: phase.description,
        status: 'backlog',
        workItemState: 'planned',
        category: 'Authority Ideas',
        epicId,
        projectSlug,
        milestoneSlug: milestone.slug,
        complexity: phase.complexity || 'medium',
      });

      // Link phase to feature
      phase.featureId = feature.id;
      createdIds.push(feature.id);

      logger.info(`Created feature for phase: "${phase.title}" (${feature.id})`);
    }

    // Set up sequential dependencies
    for (let i = 1; i < createdIds.length; i++) {
      const current = await this.featureLoader.get(projectPath, createdIds[i]);
      if (current) {
        await this.featureLoader.update(projectPath, createdIds[i], {
          dependencies: [...(current.dependencies || []), createdIds[i - 1]],
        });
      }
    }

    // Transition all to 'ready' so EM can pick them up
    for (const id of createdIds) {
      await this.featureLoader.update(projectPath, id, {
        workItemState: 'ready',
      });
    }

    logger.info(`Created ${createdIds.length} features for milestone "${milestone.title}"`);
  }

  /**
   * Scan for features in 'approved' state that need project creation.
   */
  private async scanForApprovedFeatures(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const approved = features.filter(
        (f) => f.workItemState === 'approved' && !f.projectSlug && !this.state.isProcessing(f.id)
      );

      for (const feature of approved) {
        void this.handleApprovedIdea({
          projectPath,
          featureId: feature.id,
        });
      }
    } catch (error) {
      logger.error('Failed to scan for approved features:', error);
    }
  }

  /**
   * Scan for features in 'planned' state and process them (backward compat).
   */
  private async scanForPlannedFeatures(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const planned = features.filter(
        (f) => f.workItemState === 'planned' && !this.state.isProcessing(f.id)
      );

      for (const feature of planned) {
        void this.processPlannedFeature(projectPath, feature);
      }
    } catch (error) {
      logger.error('Failed to scan for planned features:', error);
    }
  }

  /**
   * Process a planned feature (backward compat with non-milestone flow):
   * If it's an epic with children already created by PM, set up dependencies.
   * Transition to 'ready' state.
   */
  private async processPlannedFeature(projectPath: string, feature: Feature): Promise<void> {
    return withProcessingGuard(this.state, feature.id, async () => {
      const agent = this.state.getAgent(projectPath);
      if (!agent) return;

      // Skip features that belong to a project (handled by milestone flow)
      if (feature.projectSlug) {
        return;
      }

      logger.info(`Processing planned feature: "${feature.title}" (${feature.id})`);

      if (feature.isEpic) {
        await this.setupEpicDependencies(projectPath, feature, agent);
      }

      // Propose transition planned → ready
      const decision = await this.authorityService.submitProposal(
        {
          who: agent.id,
          what: 'transition_status',
          target: feature.id,
          justification: `Feature "${feature.title}" is ready for assignment.${feature.isEpic ? ` Epic with child features, dependencies configured.` : ''}`,
          risk: 'low',
          statusTransition: { from: 'planned', to: 'ready' },
        },
        projectPath
      );

      if (decision.verdict === 'deny') {
        logger.warn(`Ready transition denied for ${feature.id}: ${decision.reason}`);
        return;
      }

      if (decision.verdict === 'require_approval') {
        logger.info(`Ready transition requires approval for ${feature.id}`);
        return;
      }

      await this.featureLoader.update(projectPath, feature.id, {
        workItemState: 'ready',
      });

      logger.info(`Feature "${feature.title}" transitioned to ready`);
    });
  }

  /**
   * Set up dependencies between child features of an epic.
   */
  private async setupEpicDependencies(
    projectPath: string,
    epic: Feature,
    agent: AuthorityAgent
  ): Promise<void> {
    const allFeatures = await this.featureLoader.getAll(projectPath);
    const children = allFeatures
      .filter((f) => f.epicId === epic.id && f.id !== epic.id)
      .sort((a, b) => (a.id > b.id ? 1 : -1));

    if (children.length < 2) return;

    const decision = await this.authorityService.submitProposal(
      {
        who: agent.id,
        what: 'create_work',
        target: epic.id,
        justification: `Setting up sequential dependencies for ${children.length} child features of epic "${epic.title}"`,
        risk: 'low',
      },
      projectPath
    );

    if (decision.verdict !== 'allow') {
      logger.warn(`Dependency setup not allowed for epic ${epic.id}: ${decision.reason}`);
      return;
    }

    for (let i = 1; i < children.length; i++) {
      const current = children[i];
      const previous = children[i - 1];
      const existingDeps = current.dependencies || [];
      if (!existingDeps.includes(previous.id)) {
        await this.featureLoader.update(projectPath, current.id, {
          dependencies: [...existingDeps, previous.id],
        });
      }
    }

    for (const child of children) {
      if (child.workItemState === 'planned') {
        await this.featureLoader.update(projectPath, child.id, {
          workItemState: 'ready',
        });
      }
    }

    logger.info(
      `Dependencies set up for epic "${epic.title}": ${children.length} children chained`
    );
  }

  /**
   * Generate a URL-safe slug from a title.
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  getAgent(projectPath: string): AuthorityAgent | null {
    return this.state.getAgent(projectPath);
  }

  /**
   * PhaseProcessor implementation — orchestrator calls this during active dispatch.
   */
  async executePhase(projectPath: string, featureId: string, phase: PipelinePhase): Promise<void> {
    switch (phase) {
      case 'DESIGN':
        this.events.emit('authority:pm-review-approved', { projectPath, featureId });
        break;
      case 'PLAN':
        logger.info(`[Pipeline] PLAN phase for ${featureId} — decomposition follows design`);
        break;
      default:
        logger.warn(`[Pipeline] ProjM agent has no handler for phase ${phase}`);
    }
  }
}
