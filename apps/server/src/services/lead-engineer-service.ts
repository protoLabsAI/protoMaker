/**
 * Lead Engineer Service — Production Phase Nerve Center
 *
 * Orchestrates the full execution lifecycle for a project:
 * 1. Triggers from project:lifecycle:launched event or MCP tool
 * 2. Starts auto-mode and subscribes to the event bus
 * 3. Maintains a WorldState (board + agents + PRs + metrics)
 * 4. Evaluates fast-path rules on every event (pure functions, no LLM)
 * 5. On project completion: CeremonyService handles retro, we handle metrics
 * 6. Guards crew members from duplicating work on managed projects
 * 7. Per-feature state machine (INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → ESCALATE)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';
import type {
  EventType,
  Feature,
  LeadWorldState,
  LeadFeatureSnapshot,
  LeadAgentSnapshot,
  LeadPRSnapshot,
  LeadMilestoneSnapshot,
  LeadRuleAction,
  LeadEngineerSession,
  LeadRuleLogEntry,
  ExecuteOptions,
  AgentRole,
} from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { ProjectService } from './project-service.js';
import type { ProjectLifecycleService } from './project-lifecycle-service.js';
import type { SettingsService } from './settings-service.js';
import type { MetricsService } from './metrics-service.js';
import type { CodeRabbitResolverService } from './coderabbit-resolver-service.js';
import { DEFAULT_RULES, evaluateRules } from './lead-engineer-rules.js';

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');

const WORLD_STATE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RULE_LOG_ENTRIES = 200;

// ────────────────────────── Feature State Machine ──────────────────────────

/**
 * Feature processing states for the state machine.
 * Each feature flows through these states from INTAKE to completion or ESCALATE.
 */
export type FeatureProcessingState =
  | 'INTAKE'
  | 'PLAN'
  | 'EXECUTE'
  | 'REVIEW'
  | 'MERGE'
  | 'DEPLOY'
  | 'ESCALATE';

/**
 * State transition result
 */
export interface StateTransitionResult {
  /** Next state to transition to (null = terminal state) */
  nextState: FeatureProcessingState | null;
  /** Whether processing should continue */
  shouldContinue: boolean;
  /** Optional reason for the transition */
  reason?: string;
  /** Optional data to pass to next state */
  context?: Record<string, unknown>;
}

/**
 * State processor context - data available to all states
 */
export interface StateContext {
  feature: Feature;
  projectPath: string;
  options: ExecuteOptions;
  retryCount: number;
  planRequired: boolean;
  assignedPersona?: AgentRole;
  planOutput?: string;
  prNumber?: number;
  ciStatus?: 'pending' | 'passing' | 'failing';
  remediationAttempts: number;
  escalationReason?: string;
}

/**
 * State processor interface - each state implements this
 */
export interface StateProcessor {
  /** Called when entering this state */
  enter(ctx: StateContext): Promise<void>;
  /** Process the state and determine next transition */
  process(ctx: StateContext): Promise<StateTransitionResult>;
  /** Called when exiting this state */
  exit(ctx: StateContext): Promise<void>;
}

/**
 * INTAKE State: Load feature, classify complexity, assign persona, validate deps
 */
class IntakeProcessor implements StateProcessor {
  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[INTAKE] Processing feature: ${ctx.feature.id}`, {
      title: ctx.feature.title,
      complexity: ctx.feature.complexity,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const { feature } = ctx;

    // Validate dependencies
    if (feature.dependencies && feature.dependencies.length > 0) {
      logger.info(`[INTAKE] Feature has ${feature.dependencies.length} dependencies`);
    }

    // Classify complexity if not already set
    if (!feature.complexity) {
      ctx.feature.complexity = 'medium';
      logger.info('[INTAKE] Assigned default complexity: medium');
    }

    // Assign persona based on feature domain
    ctx.assignedPersona = this.assignPersona(feature);
    logger.info(`[INTAKE] Assigned persona: ${ctx.assignedPersona}`);

    // Determine if PLAN phase is needed
    ctx.planRequired = this.requiresPlan(feature);

    if (ctx.planRequired) {
      logger.info('[INTAKE] Feature requires PLAN phase');
      return {
        nextState: 'PLAN',
        shouldContinue: true,
        reason: 'Complex feature requires planning',
      };
    }

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Simple feature, skip planning',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[INTAKE] Completed intake processing');
  }

  private assignPersona(feature: Feature): AgentRole {
    const title = feature.title?.toLowerCase() || '';
    const description = feature.description?.toLowerCase() || '';

    if (title.includes('test') || description.includes('test')) {
      return 'qa-engineer';
    }
    if (title.includes('docs') || description.includes('documentation')) {
      return 'docs-engineer';
    }
    if (title.includes('ui') || title.includes('frontend') || description.includes('component')) {
      return 'frontend-engineer';
    }
    if (title.includes('api') || title.includes('backend') || description.includes('service')) {
      return 'backend-engineer';
    }
    if (
      title.includes('deploy') ||
      title.includes('ci') ||
      description.includes('infrastructure')
    ) {
      return 'devops-engineer';
    }
    if (feature.complexity === 'architectural') {
      return 'engineering-manager';
    }

    return 'backend-engineer';
  }

  private requiresPlan(feature: Feature): boolean {
    if (feature.complexity === 'architectural') return true;
    if (feature.complexity === 'large') return true;
    const filesToModify = (feature as { filesToModify?: string[] }).filesToModify;
    if (filesToModify && filesToModify.length >= 3) return true;
    return false;
  }
}

/**
 * PLAN State: Agent researches codebase, produces plan. Factor-based antagonistic gate.
 */
class PlanProcessor implements StateProcessor {
  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[PLAN] Starting planning phase for feature: ${ctx.feature.id}`);
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    logger.info('[PLAN] Running planning agent (stub - implementation pending)');

    // Placeholder plan output
    ctx.planOutput = 'Placeholder plan output';

    // Placeholder antagonistic gate (always approves for now)
    const gateResult = await this.antagonisticGate(ctx);

    if (!gateResult.approved) {
      logger.warn('[PLAN] Plan rejected by antagonistic gate', {
        reason: gateResult.reason,
      });

      if (gateResult.shouldRetry) {
        return {
          nextState: 'PLAN',
          shouldContinue: true,
          reason: 'Plan needs revision',
          context: { gateReason: gateResult.reason },
        };
      }

      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: 'Plan rejected, escalating',
      };
    }

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Plan approved',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[PLAN] Planning phase completed');
  }

  private async antagonisticGate(
    _ctx: StateContext
  ): Promise<{ approved: boolean; shouldRetry: boolean; reason?: string }> {
    // Stub implementation - always approve
    return { approved: true, shouldRetry: false };
  }
}

/**
 * EXECUTE State: Agent runs in worktree. Monitor. On failure → retry with context or ESCALATE.
 */
class ExecuteProcessor implements StateProcessor {
  private readonly MAX_RETRIES = 3;
  private readonly MAX_BUDGET_USD = 10.0;

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[EXECUTE] Starting execution for feature: ${ctx.feature.id}`, {
      retryCount: ctx.retryCount,
      persona: ctx.assignedPersona,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    logger.info('[EXECUTE] Running implementation agent (stub - implementation pending)');

    // Check budget
    const totalCost = ctx.feature.costUsd || 0;
    if (totalCost > this.MAX_BUDGET_USD) {
      ctx.escalationReason = `Budget exceeded: $${totalCost.toFixed(2)}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    // Check retry limit
    if (ctx.retryCount >= this.MAX_RETRIES) {
      ctx.escalationReason = `Max retries exceeded (${this.MAX_RETRIES})`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    // Stub: always succeed
    const success = true;

    if (!success) {
      ctx.retryCount++;
      logger.warn('[EXECUTE] Execution failed, will retry', {
        retryCount: ctx.retryCount,
      });

      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: 'Execution failed, retrying with more context',
      };
    }

    return {
      nextState: 'REVIEW',
      shouldContinue: true,
      reason: 'Execution completed, PR created',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[EXECUTE] Execution phase completed');
  }
}

/**
 * REVIEW State: PR created. CI runs. If fails → back to EXECUTE (bounded). If passes → MERGE.
 */
class ReviewProcessor implements StateProcessor {
  private readonly MAX_REMEDIATION_ATTEMPTS = 2;

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[REVIEW] PR review started for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    logger.info('[REVIEW] Checking PR and CI status (stub - implementation pending)');

    // Stub: In real implementation, this would check actual CI status from GitHub
    // For now, use context if set, otherwise default to passing
    if (!ctx.ciStatus) {
      ctx.ciStatus = 'passing';
    }

    if (ctx.ciStatus === 'failing') {
      if (ctx.remediationAttempts >= this.MAX_REMEDIATION_ATTEMPTS) {
        ctx.escalationReason = `CI failing after ${this.MAX_REMEDIATION_ATTEMPTS} remediation attempts`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      ctx.remediationAttempts++;
      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: 'CI failing, remediating',
        context: { remediation: true },
      };
    }

    return {
      nextState: 'MERGE',
      shouldContinue: true,
      reason: 'PR approved, CI passing',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[REVIEW] Review phase completed');
  }
}

/**
 * MERGE State: Auto-merge. Update board. GH→Linear sync.
 */
class MergeProcessor implements StateProcessor {
  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[MERGE] Starting merge for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
  }

  async process(_ctx: StateContext): Promise<StateTransitionResult> {
    logger.info('[MERGE] Merging PR (stub - implementation pending)');

    return {
      nextState: 'DEPLOY',
      shouldContinue: true,
      reason: 'PR merged successfully',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[MERGE] Merge completed');
  }
}

/**
 * DEPLOY State: Triggered by main push. Verify.
 */
class DeployProcessor implements StateProcessor {
  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[DEPLOY] Deployment verification for feature: ${ctx.feature.id}`);
  }

  async process(_ctx: StateContext): Promise<StateTransitionResult> {
    logger.info('[DEPLOY] Verifying deployment (stub - implementation pending)');

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'Feature deployed and verified',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[DEPLOY] Deployment verification completed');
  }
}

/**
 * ESCALATE State: Too many failures, budget exceeded, needs different expertise. Flag AVA.
 */
class EscalateProcessor implements StateProcessor {
  async enter(ctx: StateContext): Promise<void> {
    logger.warn(`[ESCALATE] Escalating feature: ${ctx.feature.id}`, {
      reason: ctx.escalationReason,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    logger.warn('[ESCALATE] Creating escalation (stub - implementation pending)', {
      reason: ctx.escalationReason,
    });

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'Feature escalated',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[ESCALATE] Escalation completed');
  }
}

/**
 * Feature State Machine
 *
 * Processes a single feature through states from INTAKE to completion.
 * Replaces the inner loop of auto-mode's executeFeature().
 */
export class FeatureStateMachine {
  private readonly processors: Map<FeatureProcessingState, StateProcessor>;

  constructor() {
    this.processors = new Map([
      ['INTAKE', new IntakeProcessor()],
      ['PLAN', new PlanProcessor()],
      ['EXECUTE', new ExecuteProcessor()],
      ['REVIEW', new ReviewProcessor()],
      ['MERGE', new MergeProcessor()],
      ['DEPLOY', new DeployProcessor()],
      ['ESCALATE', new EscalateProcessor()],
    ]);
  }

  /**
   * Process a feature through the state machine.
   * This replaces the inner loop of auto-mode's executeFeature().
   */
  async processFeature(
    feature: Feature,
    projectPath: string,
    options: ExecuteOptions
  ): Promise<{ finalState: FeatureProcessingState; context: StateContext }> {
    const ctx: StateContext = {
      feature,
      projectPath,
      options,
      retryCount: 0,
      planRequired: false,
      remediationAttempts: 0,
    };

    let currentState: FeatureProcessingState = 'INTAKE';
    let transitionCount = 0;
    const MAX_TRANSITIONS = 20;

    logger.info('Starting feature processing', {
      featureId: feature.id,
      title: feature.title,
      initialState: currentState,
    });

    while (currentState && transitionCount < MAX_TRANSITIONS) {
      const processor = this.processors.get(currentState);
      if (!processor) {
        logger.error(`No processor found for state: ${currentState}`);
        break;
      }

      try {
        await processor.enter(ctx);
        const result = await processor.process(ctx);
        await processor.exit(ctx);

        logger.info('State transition', {
          from: currentState,
          to: result.nextState || 'DONE',
          reason: result.reason,
          shouldContinue: result.shouldContinue,
        });

        if (!result.shouldContinue || !result.nextState) {
          logger.info('Feature processing completed', {
            featureId: feature.id,
            finalState: currentState,
            transitionCount,
          });
          break;
        }

        currentState = result.nextState;
        transitionCount++;
      } catch (error) {
        logger.error('Error processing state', {
          state: currentState,
          error: error instanceof Error ? error.message : String(error),
        });

        currentState = 'ESCALATE';
        ctx.escalationReason = `Unexpected error in ${currentState}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    if (transitionCount >= MAX_TRANSITIONS) {
      logger.error('Max transitions exceeded, escalating', {
        featureId: feature.id,
        transitionCount,
      });
      currentState = 'ESCALATE';
      ctx.escalationReason = 'Max state transitions exceeded';
    }

    return { finalState: currentState, context: ctx };
  }

  /**
   * Get the processor for a specific state (for testing or custom workflows)
   */
  getProcessor(state: FeatureProcessingState): StateProcessor | undefined {
    return this.processors.get(state);
  }

  /**
   * Register a custom processor (allows extending the state machine)
   */
  registerProcessor(state: FeatureProcessingState, processor: StateProcessor): void {
    this.processors.set(state, processor);
    logger.info(`Registered custom processor for state: ${state}`);
  }
}

// ────────────────────────── Session Management ──────────────────────────

/**
 * Persisted session data (subset of LeadEngineerSession)
 */
interface PersistedSessionData {
  projectPath: string;
  projectSlug: string;
  maxConcurrency: number;
  startedAt: string;
}

export class LeadEngineerService {
  private sessions = new Map<string, LeadEngineerSession>();
  private unsubscribe: (() => void) | null = null;
  private refreshIntervals = new Map<string, ReturnType<typeof setInterval>>();

  private discordBotService?: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  };

  private codeRabbitResolver?: CodeRabbitResolverService;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private projectService: ProjectService,
    private projectLifecycleService: ProjectLifecycleService,
    private settingsService: SettingsService,
    private metricsService: MetricsService
  ) {}

  /**
   * Set Discord bot service for post_discord action.
   */
  setDiscordBot(bot: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  }): void {
    this.discordBotService = bot;
  }

  /**
   * Set CodeRabbit resolver service for direct thread resolution.
   */
  setCodeRabbitResolver(resolver: CodeRabbitResolverService): void {
    this.codeRabbitResolver = resolver;
  }

  /**
   * Subscribe to events for auto-start and routing.
   * Restores any active sessions from disk.
   */
  async initialize(): Promise<void> {
    // Auto-start when a project is launched
    this.unsubscribe = this.events.subscribe((type: EventType, payload: unknown) => {
      if (type === 'project:lifecycle:launched') {
        const p = payload as { projectPath?: string; projectSlug?: string } | null;
        if (p?.projectPath && p?.projectSlug) {
          this.start(p.projectPath, p.projectSlug).catch((err) => {
            logger.error(`Auto-start failed for ${p.projectSlug}:`, err);
          });
        }
        return;
      }

      // Route all events to managed sessions
      this.onEvent(type, payload);
    });

    // Restore sessions from disk
    await this.restoreSessions();

    logger.info('LeadEngineerService initialized');
  }

  /**
   * Clean up subscriptions and stop all sessions.
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    for (const [projectPath] of this.sessions) {
      this.stopSession(projectPath);
    }
    this.sessions.clear();

    logger.info('LeadEngineerService destroyed');
  }

  /**
   * Start managing a project through the production phase.
   */
  async start(
    projectPath: string,
    projectSlug: string,
    opts?: { maxConcurrency?: number }
  ): Promise<LeadEngineerSession> {
    if (this.sessions.has(projectPath)) {
      const existing = this.sessions.get(projectPath)!;
      logger.warn(`Already managing project at ${projectPath}, returning existing session`);
      return existing;
    }

    logger.info(`Starting Lead Engineer for ${projectSlug} at ${projectPath}`);

    // Build initial world state
    const worldState = await this.buildWorldState(projectPath, projectSlug, opts?.maxConcurrency);

    // Create session
    const session: LeadEngineerSession = {
      projectPath,
      projectSlug,
      flowState: 'running',
      worldState,
      startedAt: new Date().toISOString(),
      ruleLog: [],
      actionsTaken: 0,
    };

    this.sessions.set(projectPath, session);

    // Start auto-mode if not already running
    if (!worldState.autoModeRunning && (worldState.boardCounts['backlog'] || 0) > 0) {
      try {
        await this.projectLifecycleService.launch(projectPath, projectSlug, opts?.maxConcurrency);
      } catch (err) {
        logger.warn(`Failed to start auto-mode for ${projectSlug}:`, err);
      }
    }

    // Set up periodic world state refresh
    const interval = setInterval(async () => {
      try {
        const s = this.sessions.get(projectPath);
        if (!s || s.flowState !== 'running') return;

        s.worldState = await this.buildWorldState(
          projectPath,
          projectSlug,
          s.worldState.maxConcurrency
        );

        // Evaluate periodic rules (stuckAgent, staleReview, orphanedInProgress)
        this.evaluateAndExecute(s, 'lead-engineer:rule-evaluated', {});
      } catch (err) {
        logger.error(`WorldState refresh failed for ${projectSlug}:`, err);
      }
    }, WORLD_STATE_REFRESH_MS);
    this.refreshIntervals.set(projectPath, interval);

    // Save session to disk
    await this.saveSession(session);

    this.events.emit('lead-engineer:started', { projectPath, projectSlug });
    logger.info(`Lead Engineer started for ${projectSlug}`);

    return session;
  }

  /**
   * Stop managing a project.
   */
  async stop(projectPath: string): Promise<void> {
    const session = this.sessions.get(projectPath);
    if (!session) {
      logger.warn(`No session found for ${projectPath}`);
      return;
    }

    this.stopSession(projectPath);
    session.flowState = 'stopped';
    session.stoppedAt = new Date().toISOString();
    this.sessions.delete(projectPath);

    // Remove session from disk
    await this.removeSession(projectPath);

    this.events.emit('lead-engineer:stopped', {
      projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Lead Engineer stopped for ${session.projectSlug}`);
  }

  /**
   * Get session for a project.
   */
  getSession(projectPath: string): LeadEngineerSession | undefined {
    return this.sessions.get(projectPath);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): LeadEngineerSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if a project is managed by Lead Engineer.
   * Used by crew members to skip managed projects.
   */
  isManaged(projectPath: string): boolean {
    return this.sessions.has(projectPath);
  }

  /**
   * Get all managed project paths.
   */
  getManagedProjectPaths(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Process a feature through the state machine.
   * This method is called by AutoModeService instead of the monolithic executeFeature().
   * Delegates to the FeatureStateMachine which handles all state transitions,
   * PR maintenance, and board consistency.
   *
   * @param projectPath - The project path
   * @param featureId - The feature ID to process
   * @param options - Execution options (model, useWorktrees, etc.)
   * @returns Promise that resolves when processing completes
   */
  async process(projectPath: string, featureId: string, options: ExecuteOptions): Promise<void> {
    logger.info(`[LeadEngineer] Processing feature ${featureId}`, {
      projectPath,
      model: options.model,
    });

    try {
      // Load the feature
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Create state machine and process the feature
      const stateMachine = new FeatureStateMachine();
      const result = await stateMachine.processFeature(feature, projectPath, options);

      logger.info(`[LeadEngineer] Feature processing completed`, {
        featureId,
        finalState: result.finalState,
        escalated: result.finalState === 'ESCALATE',
      });

      // Emit completion event for the world state to react to
      this.events.emit('lead-engineer:feature-processed' as EventType, {
        projectPath,
        featureId,
        finalState: result.finalState,
        success: result.finalState !== 'ESCALATE',
      });
    } catch (error: unknown) {
      logger.error(`[LeadEngineer] Feature processing failed`, {
        featureId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ────────────────────────── Private ──────────────────────────

  /**
   * Get the path to the session persistence file.
   */
  private getSessionFilePath(projectPath: string): string {
    const automakerDir = getAutomakerDir(projectPath);
    return path.join(automakerDir, 'lead-engineer-sessions.json');
  }

  /**
   * Save session to disk.
   */
  private async saveSession(session: LeadEngineerSession): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(session.projectPath);

      const data: PersistedSessionData = {
        projectPath: session.projectPath,
        projectSlug: session.projectSlug,
        maxConcurrency: session.worldState.maxConcurrency,
        startedAt: session.startedAt,
      };

      await atomicWriteJson(filePath, data);
      logger.debug(`Saved session to disk: ${session.projectSlug}`);
    } catch (err) {
      logger.error(`Failed to save session for ${session.projectSlug}:`, err);
    }
  }

  /**
   * Remove session from disk.
   */
  private async removeSession(projectPath: string): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(projectPath);
      const fs = await import('node:fs/promises');
      await fs.unlink(filePath);
      logger.debug(`Removed session from disk: ${projectPath}`);
    } catch (err) {
      // Ignore ENOENT errors (file doesn't exist)
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to remove session for ${projectPath}:`, err);
      }
    }
  }

  /**
   * Restore sessions from disk on server startup.
   */
  private async restoreSessions(): Promise<void> {
    // Scan for session files in all potential project directories
    // For now, we need to find projects that have session files
    // We'll iterate through features to find unique project paths
    try {
      const allProjects = await this.findProjectsWithSessions();

      for (const projectPath of allProjects) {
        try {
          const filePath = this.getSessionFilePath(projectPath);
          const result = await readJsonWithRecovery<PersistedSessionData | null>(filePath, null);

          if (!result.data) {
            continue;
          }

          const data = result.data;

          // Check if project is already completed (race condition check)
          const isCompleted = await this.isProjectCompleted(data.projectPath);
          if (isCompleted) {
            logger.info(
              `Project ${data.projectSlug} was completed during downtime, not restoring session`
            );
            await this.removeSession(data.projectPath);
            continue;
          }

          // Restore the session
          logger.info(`Restoring Lead Engineer session for ${data.projectSlug}`);
          await this.start(data.projectPath, data.projectSlug, {
            maxConcurrency: data.maxConcurrency,
          });
        } catch (err) {
          logger.error(`Failed to restore session for ${projectPath}:`, err);
        }
      }
    } catch (err) {
      logger.error('Failed to restore sessions:', err);
    }
  }

  /**
   * Find all projects that have session files.
   */
  private async findProjectsWithSessions(): Promise<string[]> {
    const projects: string[] = [];

    try {
      // Get all features to find unique project paths
      // This is a heuristic - in production, you'd want a better way to enumerate projects
      const _features = await this.featureLoader.getAll(process.cwd());
      const projectPaths = new Set<string>();

      // For now, we'll just check the current project
      // In a multi-project setup, you'd scan all projects
      projectPaths.add(process.cwd());

      // Check each project for a session file
      for (const projectPath of projectPaths) {
        try {
          const filePath = this.getSessionFilePath(projectPath);
          const fs = await import('node:fs/promises');
          await fs.access(filePath);
          projects.push(projectPath);
        } catch {
          // No session file for this project
        }
      }
    } catch (err) {
      logger.warn('Failed to enumerate projects for session restore:', err);
    }

    return projects;
  }

  /**
   * Check if a project is completed (all features done).
   */
  private async isProjectCompleted(projectPath: string): Promise<boolean> {
    try {
      const features = await this.featureLoader.getAll(projectPath);

      // If there are no features, consider it completed
      if (features.length === 0) {
        return true;
      }

      // Check if all features are done or verified
      const allCompleted = features.every((f) => f.status === 'done' || f.status === 'verified');

      return allCompleted;
    } catch {
      // If we can't determine, assume not completed
      return false;
    }
  }

  private stopSession(projectPath: string): void {
    const interval = this.refreshIntervals.get(projectPath);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(projectPath);
    }
  }

  /**
   * Route an event to the appropriate session.
   */
  private onEvent(type: EventType, payload: unknown): void {
    const p = payload as Record<string, unknown> | null;
    const projectPath = p?.projectPath as string | undefined;

    if (projectPath) {
      const session = this.sessions.get(projectPath);
      if (session && session.flowState === 'running') {
        this.updateWorldStateFromEvent(session.worldState, type, payload);
        this.evaluateAndExecute(session, type, payload);
      }
      return;
    }

    // For events without projectPath (e.g., auto-mode events), try to match by featureId
    const featureId = p?.featureId as string | undefined;
    if (featureId) {
      for (const session of this.sessions.values()) {
        if (session.flowState !== 'running') continue;
        if (session.worldState.features[featureId]) {
          this.updateWorldStateFromEvent(session.worldState, type, payload);
          this.evaluateAndExecute(session, type, payload);
          return;
        }
      }
    }
  }

  /**
   * Build a complete WorldState from scratch.
   */
  private async buildWorldState(
    projectPath: string,
    projectSlug: string,
    maxConcurrency?: number
  ): Promise<LeadWorldState> {
    const features = await this.featureLoader.getAll(projectPath);

    // Board counts
    const boardCounts: Record<string, number> = {};
    for (const f of features) {
      const status = f.status || 'backlog';
      boardCounts[status] = (boardCounts[status] || 0) + 1;
    }

    // Feature snapshots
    const featureMap: Record<string, LeadFeatureSnapshot> = {};
    for (const f of features) {
      featureMap[f.id] = this.featureToSnapshot(f);
    }

    // Running agents
    const agents: LeadAgentSnapshot[] = [];
    try {
      const runningAgents = await this.autoModeService.getRunningAgents();
      for (const a of runningAgents) {
        if (a.projectPath === projectPath) {
          agents.push({
            featureId: a.featureId,
            startTime: new Date(a.startTime).toISOString(),
            branch: a.branchName ?? undefined,
          });
        }
      }
    } catch {
      // Running agents API may fail
    }

    // Open PRs — check auto-merge status
    const openPRs: LeadPRSnapshot[] = [];
    const reviewFeatures = features.filter((f) => f.status === 'review' && f.prNumber);
    for (const f of reviewFeatures) {
      const prSnapshot: LeadPRSnapshot = {
        featureId: f.id,
        prNumber: f.prNumber!,
        prUrl: f.prUrl,
        prCreatedAt: f.prCreatedAt,
      };

      // Check auto-merge status via gh CLI
      try {
        const { stdout } = await execAsync(`gh pr view ${f.prNumber} --json autoMergeRequest`, {
          cwd: projectPath,
          timeout: 10000,
        });
        const data = JSON.parse(stdout);
        prSnapshot.autoMergeEnabled = !!data.autoMergeRequest;
      } catch {
        // gh CLI may fail — leave autoMergeEnabled undefined
      }

      openPRs.push(prSnapshot);
    }

    // Milestones
    const milestones: LeadMilestoneSnapshot[] = [];
    try {
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (project?.milestones) {
        for (const ms of project.milestones) {
          const totalPhases = ms.phases?.length || 0;
          // Count completed phases by checking if their linked features are done
          const completedPhases =
            ms.phases?.filter((p) => {
              if (!p.featureId) return false;
              const f = featureMap[p.featureId];
              return f && (f.status === 'done' || f.status === 'verified');
            }).length || 0;
          milestones.push({
            slug: ms.slug || ms.title.toLowerCase().replace(/\s+/g, '-'),
            title: ms.title,
            totalPhases,
            completedPhases,
          });
        }
      }
    } catch {
      // Project may not have milestones
    }

    // Metrics
    const completedFeatures = features.filter(
      (f) => f.status === 'done' || f.status === 'verified'
    ).length;
    const totalCostUsd = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

    let avgCycleTimeMs: number | undefined;
    try {
      const metrics = await this.metricsService.getProjectMetrics(projectPath);
      avgCycleTimeMs = metrics.avgCycleTimeMs > 0 ? metrics.avgCycleTimeMs : undefined;
    } catch {
      // Metrics may not be available
    }

    // Auto-mode status
    const activeProjects = this.autoModeService.getActiveAutoLoopProjects();
    const autoModeRunning = activeProjects.includes(projectPath);

    // Resolve max concurrency
    let resolvedMaxConcurrency = maxConcurrency || 1;
    try {
      const settings = await this.settingsService.getGlobalSettings();
      resolvedMaxConcurrency = maxConcurrency || settings.maxConcurrency || 1;
    } catch {
      // Fallback
    }

    return {
      projectPath,
      projectSlug,
      updatedAt: new Date().toISOString(),
      boardCounts,
      features: featureMap,
      agents,
      openPRs,
      milestones,
      metrics: {
        totalFeatures: features.length,
        completedFeatures,
        totalCostUsd,
        avgCycleTimeMs,
      },
      autoModeRunning,
      maxConcurrency: resolvedMaxConcurrency,
    };
  }

  /**
   * Incrementally patch WorldState from a single event.
   */
  private updateWorldStateFromEvent(
    state: LeadWorldState,
    type: EventType,
    payload: unknown
  ): void {
    const p = payload as Record<string, unknown> | null;
    const featureId = p?.featureId as string | undefined;
    const now = new Date().toISOString();

    state.updatedAt = now;

    switch (type) {
      case 'feature:status-changed': {
        if (featureId && state.features[featureId]) {
          const newStatus = p?.newStatus as string | undefined;
          if (newStatus) {
            const oldStatus = state.features[featureId].status;
            state.features[featureId].status = newStatus;

            // Update board counts
            if (oldStatus) {
              state.boardCounts[oldStatus] = Math.max(0, (state.boardCounts[oldStatus] || 0) - 1);
            }
            state.boardCounts[newStatus] = (state.boardCounts[newStatus] || 0) + 1;

            // Update metrics
            if (newStatus === 'done' || newStatus === 'verified') {
              state.metrics.completedFeatures++;
              state.features[featureId].completedAt = now;
            }
          }
        }
        break;
      }

      case 'feature:started': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].status = 'in_progress';
          state.features[featureId].startedAt = now;
          state.agents.push({ featureId, startTime: now });
        }
        break;
      }

      case 'feature:completed':
      case 'feature:stopped':
      case 'feature:error': {
        if (featureId) {
          state.agents = state.agents.filter((a) => a.featureId !== featureId);
        }
        break;
      }

      case 'feature:pr-merged': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].prMergedAt = now;
          state.openPRs = state.openPRs.filter((pr) => pr.featureId !== featureId);
        }
        break;
      }

      case 'auto-mode:started': {
        state.autoModeRunning = true;
        break;
      }

      case 'auto-mode:stopped': {
        state.autoModeRunning = false;
        break;
      }

      case 'pr:approved':
      case 'github:pr:approved': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.reviewState = 'approved';
        }
        break;
      }

      case 'pr:changes-requested':
      case 'github:pr:changes-requested': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.reviewState = 'changes_requested';
        }
        break;
      }

      case 'pr:ci-failure': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.ciStatus = 'failing';
        }
        break;
      }

      case 'pr:remediation-started': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) {
            pr.isRemediating = true;
            pr.remediationCount = (pr.remediationCount || 0) + 1;
          }
        }
        break;
      }

      case 'pr:remediation-completed': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.isRemediating = false;
        }
        break;
      }

      case 'pr:remediation-failed': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.isRemediating = false;
        }
        break;
      }

      case 'pr:threads-resolved': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.unresolvedThreads = 0;
        }
        break;
      }

      case 'pr:merge-blocked-critical-threads': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) {
            pr.unresolvedThreads =
              (p?.unresolvedCount as number) ?? (p?.threadCount as number) ?? 1;
          }
        }
        break;
      }
    }
  }

  /**
   * Find or create a PR snapshot for a feature.
   * Handles events arriving before the WorldState refresh populates the PR.
   */
  private findOrCreatePR(
    state: LeadWorldState,
    featureId: string,
    payload: Record<string, unknown> | null
  ): LeadPRSnapshot | undefined {
    let pr = state.openPRs.find((p) => p.featureId === featureId);
    if (!pr) {
      const prNumber = (payload?.prNumber as number) ?? state.features[featureId]?.prNumber;
      if (!prNumber) return undefined;
      pr = { featureId, prNumber };
      state.openPRs.push(pr);
    }
    return pr;
  }

  /**
   * Evaluate rules and execute resulting actions.
   */
  private evaluateAndExecute(
    session: LeadEngineerSession,
    eventType: string,
    payload: unknown
  ): void {
    const actions = evaluateRules(DEFAULT_RULES, session.worldState, eventType, payload);

    if (actions.length === 0) return;

    // Determine which rules produced actions (for logging)
    for (const rule of DEFAULT_RULES) {
      if (!rule.triggers.includes(eventType)) continue;
      const ruleActions = rule.evaluate(session.worldState, eventType, payload);
      if (ruleActions.length > 0) {
        const entry: LeadRuleLogEntry = {
          timestamp: new Date().toISOString(),
          ruleName: rule.name,
          eventType,
          actions: ruleActions,
        };
        session.ruleLog.push(entry);

        this.events.emit('lead-engineer:rule-evaluated', {
          projectPath: session.projectPath,
          ruleName: rule.name,
          eventType,
          actionCount: ruleActions.length,
        });
      }
    }

    // Cap rule log size
    if (session.ruleLog.length > MAX_RULE_LOG_ENTRIES) {
      session.ruleLog = session.ruleLog.slice(-MAX_RULE_LOG_ENTRIES);
    }

    // Execute all actions
    for (const action of actions) {
      this.executeAction(session, action).catch((err) => {
        logger.error(`Action execution failed (${action.type}):`, err);
      });
    }
  }

  /**
   * Execute a single rule action.
   */
  private async executeAction(session: LeadEngineerSession, action: LeadRuleAction): Promise<void> {
    session.actionsTaken++;

    this.events.emit('lead-engineer:action-executed', {
      projectPath: session.projectPath,
      actionType: action.type,
      details: action as unknown as Record<string, unknown>,
    });

    switch (action.type) {
      case 'move_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: action.toStatus,
          });
          logger.info(`Moved feature ${action.featureId} to ${action.toStatus}`);
        } catch (err) {
          logger.error(`Failed to move feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'reset_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
          logger.info(`Reset feature ${action.featureId}: ${action.reason}`);
        } catch (err) {
          logger.error(`Failed to reset feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'unblock_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
          logger.info(`Unblocked feature ${action.featureId}`);
        } catch (err) {
          logger.error(`Failed to unblock feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'enable_auto_merge': {
        try {
          await execAsync(`gh pr merge ${action.prNumber} --auto --squash`, {
            cwd: session.projectPath,
            timeout: 30000,
          });
          // Update in-memory PR snapshot so staleReview doesn't re-fire
          const pr = session.worldState.openPRs.find((p) => p.featureId === action.featureId);
          if (pr) pr.autoMergeEnabled = true;
          logger.info(`Enabled auto-merge on PR #${action.prNumber}`);
        } catch (err) {
          logger.warn(`Failed to enable auto-merge on PR #${action.prNumber}:`, err);
        }
        break;
      }

      case 'resolve_threads_direct': {
        if (!this.codeRabbitResolver) {
          logger.warn('CodeRabbitResolverService not available, cannot resolve threads directly');
          break;
        }
        try {
          const result = await this.codeRabbitResolver.resolveThreads(
            session.projectPath,
            action.prNumber
          );
          logger.info(
            `Resolved ${result.resolvedCount}/${result.totalThreads} threads on PR #${action.prNumber}`
          );
        } catch (err) {
          logger.warn(`Failed to resolve threads on PR #${action.prNumber}:`, err);
        }
        break;
      }

      case 'resolve_threads': {
        this.events.emit('escalation:signal-received', {
          source: 'pr_feedback',
          severity: 'medium',
          type: 'thread_resolution_requested',
          context: {
            featureId: action.featureId,
            prNumber: action.prNumber,
            projectPath: session.projectPath,
          },
          deduplicationKey: `resolve_threads_${action.prNumber}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'restart_auto_mode': {
        try {
          await this.autoModeService.startAutoLoopForProject(
            action.projectPath,
            null, // branchName
            action.maxConcurrency || session.worldState.maxConcurrency
          );
          session.worldState.autoModeRunning = true;
          logger.info(`Restarted auto-mode for ${action.projectPath}`);
        } catch (err) {
          logger.warn(`Failed to restart auto-mode:`, err);
        }
        break;
      }

      case 'stop_agent': {
        try {
          await this.autoModeService.stopFeature(action.featureId);
          logger.info(`Stopped agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to stop agent for ${action.featureId}:`, err);
        }
        break;
      }

      case 'send_agent_message': {
        try {
          await this.autoModeService.followUpFeature(
            session.projectPath,
            action.featureId,
            action.message
          );
          logger.info(`Sent message to agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to send message to agent ${action.featureId}:`, err);
        }
        break;
      }

      case 'post_discord': {
        if (this.discordBotService) {
          await this.discordBotService
            .sendToChannel(action.channelId, action.message)
            .catch((err) => logger.warn(`Failed to post to Discord: ${err}`));
        }
        break;
      }

      case 'log': {
        logger[action.level](`[Rule] ${action.message}`);
        break;
      }

      case 'escalate_llm': {
        this.events.emit('escalation:signal-received', {
          source: 'lead_engineer_escalation',
          severity: 'high',
          type: 'lead_engineer_escalation',
          context: {
            ...action.context,
            projectPath: session.projectPath,
            reason: action.reason,
          },
          deduplicationKey: `le_escalation_${session.projectPath}_${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'project_completing': {
        await this.handleProjectCompleting(session);
        break;
      }
    }
  }

  /**
   * Handle project completion: transition to completing state.
   * CeremonyService handles retro + Discord automatically (already subscribed to project:completed).
   * Lead Engineer aggregates final metrics.
   */
  private async handleProjectCompleting(session: LeadEngineerSession): Promise<void> {
    session.flowState = 'completing';
    this.events.emit('lead-engineer:project-completing', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completing — aggregating final metrics`);

    // Refresh final world state
    try {
      session.worldState = await this.buildWorldState(
        session.projectPath,
        session.projectSlug,
        session.worldState.maxConcurrency
      );
    } catch (err) {
      logger.error(`Failed to build final world state:`, err);
    }

    // Emit completion event
    this.events.emit('lead-engineer:project-completed', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    // Transition to idle
    session.flowState = 'idle';

    // Clean up
    this.stopSession(session.projectPath);
    this.sessions.delete(session.projectPath);

    // Remove session from disk
    await this.removeSession(session.projectPath);

    this.events.emit('lead-engineer:stopped', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completed. Lead Engineer session ended.`);
  }

  /**
   * Convert a Feature to a LeadFeatureSnapshot.
   */
  private featureToSnapshot(f: Feature): LeadFeatureSnapshot {
    return {
      id: f.id,
      title: f.title,
      status: (f.status as string) || 'backlog',
      branchName: f.branchName,
      prNumber: f.prNumber,
      prUrl: f.prUrl,
      prCreatedAt: f.prCreatedAt,
      prMergedAt: f.prMergedAt,
      costUsd: f.costUsd,
      failureCount: f.failureCount,
      dependencies: f.dependencies,
      epicId: f.epicId,
      isEpic: f.isEpic,
      complexity: f.complexity,
      startedAt: f.startedAt,
      completedAt: f.completedAt,
    };
  }
}
