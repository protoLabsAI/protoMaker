/**
 * EM Authority Agent - Engineering Manager AI Agent
 *
 * Responsible for the "who & capacity" of feature execution:
 * - Monitors features in 'ready' state (set by ProjM agent)
 * - Assesses complexity and assigns appropriate agent roles
 * - Checks capacity (WIP limits)
 * - Triggers auto-mode execution by transitioning: ready → in_progress
 * - Monitors PR feedback and reassigns features for fixes
 * - Manages the full dev lifecycle: assign → work → PR → review → fix → merge
 *
 * All actions go through AuthorityService.submitProposal().
 */

import type { Feature } from '@automaker/types';
import type { AuthorityAgent } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AutoModeService } from '../auto-mode-service.js';

const logger = createLogger('EMAgent');

/** Polling interval for checking ready features */
const POLL_INTERVAL_MS = 10_000;

/** Default WIP limit per project */
const DEFAULT_WIP_LIMIT = 3;

/** Max PR iterations before escalating to CTO */
const MAX_PR_ITERATIONS = 3;

export class EMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly autoModeService: AutoModeService;

  private agents = new Map<string, AuthorityAgent>();
  private initializedProjects = new Set<string>();
  private processing = new Set<string>();
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>();

  /** Features currently being reassigned for PR fixes (prevent double-processing) */
  private reassigning = new Set<string>();

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.autoModeService = autoModeService;
  }

  /**
   * Initialize the EM agent for a project.
   */
  async initialize(projectPath: string): Promise<void> {
    if (this.initializedProjects.has(projectPath)) return;

    const agent = await this.authorityService.registerAgent('engineering-manager', projectPath);
    this.agents.set(projectPath, agent);
    this.initializedProjects.add(projectPath);
    logger.info(`EM agent registered for project: ${agent.id}`);

    // Listen for PR feedback events
    this.listenForPRFeedback();

    // Scan for existing ready features
    await this.scanForReadyFeatures(projectPath);

    // Start periodic polling
    const timer = setInterval(() => {
      void this.scanForReadyFeatures(projectPath);
    }, POLL_INTERVAL_MS);
    this.pollTimers.set(projectPath, timer);
  }

  /**
   * Listen for PR feedback events and handle reassignment.
   */
  private listenForPRFeedback(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'pr:changes-requested') {
        void this.handleChangesRequested(payload as Record<string, unknown>);
      }

      if (type === 'pr:approved') {
        void this.handlePRApproved(payload as Record<string, unknown>);
      }
    });
  }

  /**
   * Handle PR changes requested: reassign feature back to dev agent for fixes.
   */
  private async handleChangesRequested(data: Record<string, unknown>): Promise<void> {
    const featureId = data.featureId as string;
    const projectPath = data.projectPath as string;
    const feedback = data.feedback as string;
    const iterationCount = data.iterationCount as number;
    const prNumber = data.prNumber as number;

    if (!featureId || !projectPath || this.reassigning.has(featureId)) return;
    this.reassigning.add(featureId);

    try {
      const agent = this.agents.get(projectPath);
      if (!agent) return;

      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;

      logger.info(
        `PR #${prNumber} changes requested for "${feature.title}" (iteration ${iterationCount})`
      );

      if (iterationCount > MAX_PR_ITERATIONS) {
        // Escalate to CTO - too many iterations
        logger.warn(`Feature "${feature.title}" exceeded max PR iterations, escalating`);
        return; // PR feedback service handles escalation
      }

      // Submit reassignment proposal through authority
      const decision = await this.authorityService.submitProposal(
        {
          who: agent.id,
          what: 'assign_work',
          target: featureId,
          justification: `Reassigning for PR fixes (iteration ${iterationCount}). Feedback: ${(feedback || '').slice(0, 300)}`,
          risk: 'low',
        },
        projectPath
      );

      if (decision.verdict === 'deny') {
        logger.warn(`Reassignment denied for ${featureId}: ${decision.reason}`);
        return;
      }

      // Append PR feedback to feature description so the agent knows what to fix
      const fixInstructions = [
        feature.description || '',
        '',
        `---`,
        `## PR Review Feedback (Iteration ${iterationCount})`,
        ``,
        `The PR (#${prNumber}) received review feedback. Fix the following:`,
        ``,
        feedback || 'See PR comments for details.',
        ``,
        `**Important:** Only fix the issues mentioned in the review. Do not refactor or change anything else.`,
      ].join('\n');

      // Update feature: reset to backlog for re-execution, add feedback
      await this.featureLoader.update(projectPath, featureId, {
        status: 'backlog',
        workItemState: 'in_progress',
        description: fixInstructions,
        summary: undefined, // Clear old completion summary
        prIterationCount: iterationCount,
        lastReviewFeedback: (feedback || '').slice(0, 2000),
        error: undefined, // Clear previous errors
      });

      this.events.emit('feature:reassigned-for-fixes', {
        projectPath,
        featureId,
        prNumber,
        iterationCount,
        assignedBy: agent.id,
      });

      logger.info(
        `Feature "${feature.title}" reassigned for PR fixes (iteration ${iterationCount})`
      );
    } catch (error) {
      logger.error(`Failed to handle PR feedback for ${featureId}:`, error);
    } finally {
      this.reassigning.delete(featureId);
    }
  }

  /**
   * Handle PR approval: ensure feature transitions to done or triggers merge.
   */
  private async handlePRApproved(data: Record<string, unknown>): Promise<void> {
    const featureId = data.featureId as string;
    const projectPath = data.projectPath as string;
    const prNumber = data.prNumber as number;

    if (!featureId || !projectPath) return;

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;

      logger.info(`PR #${prNumber} approved for "${feature.title}"`);

      // Feature will transition to 'done' when the PR merge webhook fires.
      // We just log it here for visibility.
      // If auto-merge is enabled, the git workflow service handles merging.
    } catch (error) {
      logger.error(`Failed to handle PR approval for ${featureId}:`, error);
    }
  }

  /**
   * Stop the EM agent for a project.
   */
  stop(projectPath: string): void {
    const timer = this.pollTimers.get(projectPath);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(projectPath);
    }
    this.initializedProjects.delete(projectPath);
    logger.info(`EM agent stopped for project: ${projectPath}`);
  }

  /**
   * Scan for features in 'ready' state and process them.
   */
  private async scanForReadyFeatures(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);

      // Check WIP: how many features are currently in_progress?
      const inProgress = features.filter(
        (f) => f.status === 'running' || f.workItemState === 'in_progress'
      );

      if (inProgress.length >= DEFAULT_WIP_LIMIT) {
        logger.debug(`WIP limit reached (${inProgress.length}/${DEFAULT_WIP_LIMIT}), skipping`);
        return;
      }

      const ready = features
        .filter(
          (f) =>
            f.workItemState === 'ready' &&
            !f.isEpic && // Don't process epics directly
            !this.processing.has(f.id)
        )
        .sort((a, b) => {
          // Prioritize by: dependencies resolved first, then by priority
          const aDeps = a.dependencies?.length || 0;
          const bDeps = b.dependencies?.length || 0;
          if (aDeps !== bDeps) return aDeps - bDeps;
          return (b.priority || 0) - (a.priority || 0);
        });

      // Process up to WIP limit
      const slotsAvailable = DEFAULT_WIP_LIMIT - inProgress.length;
      const toProcess = ready.slice(0, slotsAvailable);

      for (const feature of toProcess) {
        // Check if dependencies are met
        if (feature.dependencies?.length) {
          const depsMet = await this.checkDependenciesMet(projectPath, feature, features);
          if (!depsMet) {
            logger.debug(`Feature ${feature.id} has unmet dependencies, skipping`);
            continue;
          }
        }

        void this.processReadyFeature(projectPath, feature);
      }
    } catch (error) {
      logger.error('Failed to scan for ready features:', error);
    }
  }

  /**
   * Check if all dependencies for a feature are satisfied (done state).
   */
  private async checkDependenciesMet(
    _projectPath: string,
    feature: Feature,
    allFeatures: Feature[]
  ): Promise<boolean> {
    if (!feature.dependencies?.length) return true;

    for (const depId of feature.dependencies) {
      const dep = allFeatures.find((f) => f.id === depId);
      if (!dep || dep.status !== 'done') {
        return false;
      }
    }
    return true;
  }

  /**
   * Process a ready feature:
   * 1. Assess complexity if not already set
   * 2. Submit assign_work proposal
   * 3. Transition ready → in_progress (triggers auto-mode)
   */
  private async processReadyFeature(projectPath: string, feature: Feature): Promise<void> {
    if (this.processing.has(feature.id)) return;
    this.processing.add(feature.id);

    try {
      const agent = this.agents.get(projectPath);
      if (!agent) return;

      logger.info(`Processing ready feature: "${feature.title}" (${feature.id})`);

      // Step 1: Assess and set complexity if not already set
      if (!feature.complexity) {
        const complexity = this.assessComplexity(feature);
        await this.featureLoader.update(projectPath, feature.id, { complexity });
        logger.info(`Set complexity for "${feature.title}": ${complexity}`);
      }

      // Step 2: Submit assignment proposal
      const assignDecision = await this.authorityService.submitProposal(
        {
          who: agent.id,
          what: 'assign_work',
          target: feature.id,
          justification: `Assigning "${feature.title}" (complexity: ${feature.complexity || 'medium'}) for auto-mode execution`,
          risk: 'low',
        },
        projectPath
      );

      if (assignDecision.verdict === 'deny') {
        logger.warn(`Assignment denied for ${feature.id}: ${assignDecision.reason}`);
        return;
      }

      if (assignDecision.verdict === 'require_approval') {
        logger.info(`Assignment requires approval for ${feature.id}`);
        return;
      }

      // Step 3: Propose transition ready → in_progress
      const startDecision = await this.authorityService.submitProposal(
        {
          who: agent.id,
          what: 'assign_work',
          target: feature.id,
          justification: `Starting execution of "${feature.title}"`,
          risk: 'low',
          statusTransition: { from: 'ready', to: 'in_progress' },
        },
        projectPath
      );

      if (startDecision.verdict === 'deny') {
        logger.warn(`Start transition denied for ${feature.id}: ${startDecision.reason}`);
        return;
      }

      if (startDecision.verdict === 'require_approval') {
        logger.info(`Start transition requires approval for ${feature.id}`);
        return;
      }

      // Transition approved - update workItemState and trigger auto-mode
      await this.featureLoader.update(projectPath, feature.id, {
        workItemState: 'in_progress',
      });

      // Ensure auto-mode is running so the feature gets picked up
      if (!this.autoModeService.isAutoLoopRunningForProject(projectPath)) {
        try {
          await this.autoModeService.startAutoLoopForProject(projectPath);
          logger.info(`Auto-mode started for project to execute assigned features`);
        } catch (error) {
          logger.warn(`Could not start auto-mode (may already be running):`, error);
        }
      }

      // Emit event that EM has assigned and started a feature
      this.events.emit('feature-assignment:started', {
        projectPath,
        featureId: feature.id,
        assignedBy: agent.id,
        complexity: feature.complexity || 'medium',
      });

      logger.info(`Feature "${feature.title}" assigned and transitioned to in_progress`);
    } catch (error) {
      logger.error(`Failed to process ready feature ${feature.id}:`, error);
    } finally {
      this.processing.delete(feature.id);
    }
  }

  /**
   * Assess feature complexity based on description heuristics.
   */
  private assessComplexity(feature: Feature): 'small' | 'medium' | 'large' | 'architectural' {
    const desc = feature.description || '';
    const wordCount = desc.split(/\s+/).length;

    // Check for architectural keywords
    const archKeywords =
      /\b(architecture|infrastructure|migration|refactor|breaking change|system design)\b/i;
    if (archKeywords.test(desc)) return 'architectural';

    if (wordCount > 300) return 'large';
    if (wordCount > 100) return 'medium';
    return 'small';
  }

  getAgent(projectPath: string): AuthorityAgent | null {
    return this.agents.get(projectPath) ?? null;
  }
}
