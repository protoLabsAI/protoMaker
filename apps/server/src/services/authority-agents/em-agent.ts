/**
 * EM Authority Agent - Engineering Manager AI Agent
 *
 * Responsible for the "who & capacity" of feature execution:
 * - Monitors features in 'ready' state (set by ProjM agent)
 * - Assesses complexity and assigns appropriate agent roles
 * - Checks capacity (WIP limits)
 * - Triggers auto-mode execution by transitioning: ready → in_progress
 * - Handles PR approvals: merges PRs if CI passes and auto-merge is enabled
 * - Manages the full dev lifecycle: assign → work → PR → review → merge
 *
 * PR feedback handling is delegated exclusively to PRFeedbackService to avoid race conditions.
 * All actions go through AuthorityService.submitProposal().
 */

import type { Feature } from '@protolabs-ai/types';
import type { AuthorityAgent } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import type { AutoModeService } from '../auto-mode-service.js';
import { githubMergeService } from '../github-merge-service.js';
import type { AuditService } from '../audit-service.js';
import type { SettingsService } from '../settings-service.js';
import type { HITLFormService } from '../hitl-form-service.js';
import {
  createAgentState,
  initializeAgent,
  withProcessingGuard,
  type AgentState,
} from './agent-utils.js';

const logger = createLogger('EMAgent');

/** Polling interval for checking ready features */
const POLL_INTERVAL_MS = 10_000;

/** Default WIP limit per project */
const DEFAULT_WIP_LIMIT = 3;

/** Custom state for EM agent */
interface EMCustomState {
  pollTimers: Map<string, ReturnType<typeof setInterval>>;
}

export class EMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;
  private readonly autoModeService: AutoModeService;
  private readonly auditService: AuditService;
  private readonly settingsService: SettingsService;
  private readonly hitlFormService: HITLFormService | null;
  private leadEngineerService?: { isActive(projectPath: string): boolean };

  /** Agent state (agents, initialization, processing tracking, poll timers) */
  private readonly state: AgentState<EMCustomState>;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService,
    auditService: AuditService,
    settingsService: SettingsService,
    hitlFormService?: HITLFormService
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;
    this.autoModeService = autoModeService;
    this.auditService = auditService;
    this.settingsService = settingsService;
    this.hitlFormService = hitlFormService || null;
    this.state = createAgentState<EMCustomState>({
      pollTimers: new Map(),
    });
  }

  setLeadEngineerService(s: { isActive(projectPath: string): boolean }): void {
    this.leadEngineerService = s;
  }

  /**
   * Initialize the EM agent for a project.
   */
  async initialize(projectPath: string): Promise<void> {
    await initializeAgent(
      this.state,
      this.authorityService,
      'engineering-manager',
      projectPath,
      async () => {
        // Listen for PR feedback events
        this.listenForPRFeedback();

        // Scan for existing ready features
        await this.scanForReadyFeatures(projectPath);

        // Start periodic polling
        const timer = setInterval(() => {
          void this.scanForReadyFeatures(projectPath);
        }, POLL_INTERVAL_MS);
        this.state.custom.pollTimers.set(projectPath, timer);
      }
    );
  }

  /**
   * Listen for PR approval events and handle merge.
   * PR feedback is handled exclusively by PRFeedbackService to avoid race conditions.
   */
  private listenForPRFeedback(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'pr:approved') {
        const data = payload as Record<string, unknown>;
        const projectPath = data.projectPath as string;

        if (projectPath && !this.state.isInitialized(projectPath)) {
          logger.info(
            `[EMAgent] Auto-initializing for PR event on uninitialized project: ${projectPath}`
          );
          void (async () => {
            try {
              await this.initialize(projectPath);
              await this.handlePRApproved(data);
            } catch (error) {
              logger.error(`[EMAgent] Auto-initialization failed for ${projectPath}:`, error);
            }
          })();
        } else {
          void this.handlePRApproved(data);
        }
      }
    });
  }

  /**
   * Handle PR approval: merge the PR if CI passes and auto-merge is enabled.
   */
  private async handlePRApproved(data: Record<string, unknown>): Promise<void> {
    const featureId = data.featureId as string;
    const projectPath = data.projectPath as string;
    const prNumber = data.prNumber as number;

    if (!featureId || !projectPath || !prNumber) return;

    try {
      const agent = this.state.getAgent(projectPath);
      if (!agent) return;

      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;

      logger.info(`PR #${prNumber} approved for "${feature.title}"`);

      // Get git workflow settings to check if auto-merge is enabled
      const settings = await this.settingsService.getGlobalSettings();
      const gitWorkflow = settings.gitWorkflow || {};
      const autoMergePR = gitWorkflow.autoMergePR ?? false;

      if (!autoMergePR) {
        logger.info(
          `Auto-merge is disabled for PR #${prNumber}. Feature will transition to 'done' when manually merged.`
        );
        return;
      }

      // Attempt to merge the PR
      const mergeStrategy = gitWorkflow.prMergeStrategy || 'squash';
      const waitForCI = gitWorkflow.waitForCI ?? true;

      logger.info(
        `Attempting to merge PR #${prNumber} with strategy: ${mergeStrategy}, waitForCI: ${waitForCI}`
      );

      const mergeResult = await githubMergeService.mergePR(
        projectPath,
        prNumber,
        mergeStrategy,
        waitForCI
      );

      if (mergeResult.success) {
        logger.info(
          `Successfully merged PR #${prNumber} for feature "${feature.title}" (commit: ${mergeResult.mergeCommitSha || 'unknown'})`
        );

        // Log audit event for merge decision
        await this.auditService.logDecision(projectPath, {
          agentId: agent.id,
          role: 'engineering-manager',
          decisionType: 'pr_merge',
          action: 'merge_pr',
          target: featureId,
          verdict: 'approved',
          reason: `PR #${prNumber} approved and CI passed. Auto-merged using ${mergeStrategy} strategy.`,
          tags: ['pr', 'merge', 'auto-merge'],
          metadata: {
            prNumber,
            mergeStrategy,
            mergeCommitSha: mergeResult.mergeCommitSha,
            featureTitle: feature.title,
          },
        });

        // Update feature status to done and set merge timestamps
        const prMergedAt = new Date().toISOString();
        const updates: Partial<Feature> = {
          status: 'done',
          prMergedAt,
        };

        // Calculate review duration if prCreatedAt is available
        if (feature.prCreatedAt) {
          const createdAt = new Date(feature.prCreatedAt);
          const mergedAt = new Date(prMergedAt);
          updates.prReviewDurationMs = mergedAt.getTime() - createdAt.getTime();
        }

        await this.featureLoader.update(projectPath, featureId, updates);

        // Emit event for UI notification
        this.events.emit('feature:pr-merged', {
          featureId,
          title: feature.title,
          prNumber,
          projectPath,
          mergedBy: 'em-agent',
          mergeCommitSha: mergeResult.mergeCommitSha,
        });

        logger.info(`Feature "${feature.title}" transitioned to 'done' after PR merge`);
      } else {
        // Merge failed - log the reason
        const reason = mergeResult.error || 'Unknown merge failure';
        logger.warn(`Failed to merge PR #${prNumber} for "${feature.title}": ${reason}`);

        // Log audit event for failed merge attempt
        await this.auditService.logDecision(projectPath, {
          agentId: agent.id,
          role: 'engineering-manager',
          decisionType: 'pr_merge',
          action: 'merge_pr',
          target: featureId,
          verdict: 'denied',
          reason: `Failed to auto-merge PR #${prNumber}: ${reason}`,
          tags: ['pr', 'merge', 'auto-merge', 'failed'],
          metadata: {
            prNumber,
            error: reason,
            checksPending: mergeResult.checksPending,
            checksFailed: mergeResult.checksFailed,
            failedChecks: mergeResult.failedChecks,
            featureTitle: feature.title,
          },
        });

        // If CI is still pending or failed, keep feature in review state
        if (mergeResult.checksPending) {
          logger.info(
            `PR #${prNumber} has pending CI checks. Will retry merge after checks complete.`
          );
        } else if (mergeResult.checksFailed) {
          logger.warn(
            `PR #${prNumber} has failed CI checks: ${mergeResult.failedChecks?.join(', ')}. Manual intervention required.`
          );
          // Mark feature as blocked if CI failed
          await this.featureLoader.update(projectPath, featureId, {
            workItemState: 'blocked',
            error: `PR #${prNumber} CI checks failed: ${mergeResult.failedChecks?.join(', ')}`,
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to handle PR approval for ${featureId}:`, error);
    }
  }

  /**
   * Stop the EM agent for a project.
   */
  stop(projectPath: string): void {
    const timer = this.state.custom.pollTimers.get(projectPath);
    if (timer) {
      clearInterval(timer);
      this.state.custom.pollTimers.delete(projectPath);
    }
    this.state.removeInitialized(projectPath);
    logger.info(`EM agent stopped for project: ${projectPath}`);
  }

  /**
   * Scan for features in 'ready' state and process them.
   */
  private async scanForReadyFeatures(projectPath: string): Promise<void> {
    // Skip when Lead Engineer owns the lifecycle for this project
    if (this.leadEngineerService?.isActive(projectPath)) {
      logger.debug(`[EMAgent] Lead Engineer is active for ${projectPath}, skipping EM scan`);
      return;
    }
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
            !this.state.isProcessing(f.id)
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
    return withProcessingGuard(this.state, feature.id, async () => {
      try {
        const agent = this.state.getAgent(projectPath);
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
          const approved = await this.requestHITLApproval(
            projectPath,
            feature,
            `Approve assigning "${feature.title}" (complexity: ${feature.complexity || 'medium'}) for agent execution?`
          );
          if (!approved) {
            logger.info(`Assignment denied via HITL for ${feature.id}`);
            return;
          }
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
          const approved = await this.requestHITLApproval(
            projectPath,
            feature,
            `Approve starting execution of "${feature.title}"?`
          );
          if (!approved) {
            logger.info(`Start transition denied via HITL for ${feature.id}`);
            return;
          }
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
      }
    });
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

  /**
   * Request human approval via HITL form.
   * Returns true if approved, false if denied or timed out.
   */
  private async requestHITLApproval(
    projectPath: string,
    feature: Feature,
    question: string
  ): Promise<boolean> {
    if (!this.hitlFormService) {
      logger.debug('No HITLFormService available, auto-denying approval request');
      return false;
    }

    const form = this.hitlFormService.create({
      title: `EM: Approve Feature Assignment`,
      description: question,
      steps: [
        {
          title: 'Decision',
          description: `Feature: "${feature.title}" (${feature.id})`,
          schema: {
            type: 'object',
            properties: {
              decision: {
                type: 'string',
                title: 'Decision',
                enum: ['approve', 'deny'],
              },
            },
            required: ['decision'],
          },
          uiSchema: {
            decision: { 'ui:widget': 'radio' },
          },
        },
      ],
      callerType: 'agent',
      featureId: feature.id,
      projectPath,
      ttlSeconds: 300,
    });

    logger.info(`HITL approval form created: ${form.id} for feature ${feature.id}`);

    const response = await this.waitForFormResponse(form.id, 300_000);
    return response?.[0]?.decision === 'approve';
  }

  /**
   * Wait for a HITL form response with timeout.
   */
  private waitForFormResponse(
    formId: string,
    timeoutMs: number
  ): Promise<Record<string, unknown>[] | null> {
    return new Promise((resolve) => {
      let settled = false;
      const unsub = this.events.subscribe((type, payload) => {
        if (settled) return;
        const p = payload as {
          formId: string;
          cancelled: boolean;
          response?: Record<string, unknown>[];
        };
        if (type === 'hitl:form-responded' && p.formId === formId) {
          settled = true;
          unsub();
          resolve(p.cancelled ? null : (p.response ?? null));
        }
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub();
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  getAgent(projectPath: string): AuthorityAgent | null {
    return this.state.getAgent(projectPath);
  }
}
