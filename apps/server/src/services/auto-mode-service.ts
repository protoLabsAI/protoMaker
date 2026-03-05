/**
 * Auto Mode Service - Autonomous feature implementation using Claude Agent SDK
 *
 * Manages:
 * - Worktree creation for isolated development
 * - Feature execution with Claude
 * - Concurrent execution with max concurrency limits
 * - Progress streaming via events
 * - Verification and merge workflows
 */

import * as v8 from 'node:v8';
import { ProviderFactory } from '../providers/provider-factory.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { StreamObserver } from './stream-observer-service.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import { setFeatureContext } from '@protolabsai/error-tracking';

/**
 * Error thrown when stream observer detects an agent loop.
 * Caught by executeFeature() to retry with recovery guidance.
 */
export class LoopDetectedError extends Error {
  readonly loopSignature: string;
  constructor(message: string, loopSignature: string) {
    super(message);
    this.name = 'LoopDetectedError';
    this.loopSignature = loopSignature;
  }
}
import type {
  ExecuteOptions,
  Feature,
  ExecutionRecord,
  ModelProvider,
  PipelineStep,
  FeatureStatusWithPipeline,
  PipelineConfig,
  ThinkingLevel,
  PlanningMode,
  ExecutionContext,
  ActionProposal,
  EventType,
  ExecutionState,
} from '@protolabsai/types';
import {
  DEFAULT_PHASE_MODELS,
  DEFAULT_MAX_CONCURRENCY,
  MAX_SYSTEM_CONCURRENCY,
  isClaudeModel,
  stripProviderPrefix,
  normalizeFeatureStatus,
  EscalationSource,
  EscalationSeverity,
} from '@protolabsai/types';
import {
  buildPromptWithImages,
  classifyError,
  loadContextFiles,
  appendLearning,
  recordMemoryUsage,
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
  type DedupChecker,
  type IndexRebuilder,
} from '@protolabsai/utils';

const logger = createLogger('AutoMode');
import { resolveModelString, resolvePhaseModel, DEFAULT_MODELS } from '@protolabsai/model-resolver';
import {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingInfo,
} from '@protolabsai/dependency-resolver';
import {
  getFeatureDir,
  getAutomakerDir,
  getFeaturesDir,
  getExecutionStatePath,
  ensureAutomakerDir,
} from '@protolabsai/platform';
import { rebaseWorktreeOnMain } from '@protolabsai/git-utils';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import { TypedEventBus } from './auto-mode/typed-event-bus.js';
import { ConcurrencyManager } from './auto-mode/concurrency-manager.js';
import { ensureCleanWorktree } from '../lib/worktree-guard.js';
import {
  agentCostTotal,
  agentExecutionDuration,
  activeAgentsCount,
  agentTokensInputTotal,
  agentTokensOutputTotal,
  agentExecutionsTotal,
} from '../lib/prometheus.js';
import {
  createAutoModeOptions,
  createCustomOptions,
  validateWorkingDirectory,
} from '../lib/sdk-options.js';
import { FeatureLoader } from './feature-loader.js';
import type { SettingsService } from './settings-service.js';
import type { AuthorityService } from './authority-service.js';
import type { DataIntegrityWatchdogService } from './data-integrity-watchdog-service.js';
import { pipelineService } from './pipeline-service.js';
import {
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getPromptCustomization,
  getProviderByModelId,
  getPhaseModelWithOverrides,
} from '../lib/settings-helpers.js';
import { getNotificationService } from './notification-service.js';
import { RecoveryService, getRecoveryService } from './recovery-service.js';
import type { LeadEngineerService } from './lead-engineer-service.js';
import { gitWorkflowService } from './git-workflow-service.js';
import type { KnowledgeStoreService } from './knowledge-store-service.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import {
  AutoLoopCoordinator,
  type LoopState,
  type AutoModeLoopConfig,
} from './auto-mode/auto-loop-coordinator.js';
import { FeatureStateManager } from './auto-mode/feature-state-manager.js';
import { ExecutionService } from './auto-mode/execution-service.js';
import type {
  RunningFeature,
  PendingApproval,
  ExecuteFeatureOptions,
  IAutoModeCallbacks,
  PlanSpec,
  ParsedTask,
} from './auto-mode/execution-types.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Get the current branch name for a git repository
 * @param projectPath - Path to the git repository
 * @returns The current branch name, or null if not in a git repo or on detached HEAD
 */
async function getCurrentBranch(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
    const branch = stdout.trim();
    return branch || null;
  } catch {
    return null;
  }
}

// PlanningMode type is imported from @protolabsai/types

// Model selection for features is handled by AutoModeService.getModelForFeature() class method
// which reads the user-configured agentExecutionModel from settings.

/**
 * Information about pipeline status when resuming a feature.
 * Used to determine how to handle features stuck in pipeline execution.
 *
 * @property {boolean} isPipeline - Whether the feature is in a pipeline step
 * @property {string | null} stepId - ID of the current pipeline step (e.g., 'step_123')
 * @property {number} stepIndex - Index of the step in the sorted pipeline steps (-1 if not found)
 * @property {number} totalSteps - Total number of steps in the pipeline
 * @property {PipelineStep | null} step - The pipeline step configuration, or null if step not found
 * @property {PipelineConfig | null} config - The full pipeline configuration, or null if no pipeline
 */
interface PipelineStatusInfo {
  isPipeline: boolean;
  stepId: string | null;
  stepIndex: number;
  totalSteps: number;
  step: PipelineStep | null;
  config: PipelineConfig | null;
}

interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
  branchName: string | null; // null = main worktree
}

/**
 * Generate a unique key for worktree-scoped auto loop state
 * @param projectPath - The project path
 * @param branchName - The branch name, or null for main worktree
 */
function getWorktreeAutoLoopKey(projectPath: string, branchName: string | null): string {
  const normalizedBranch = branchName === 'main' ? null : branchName;
  return `${projectPath}::${normalizedBranch ?? '__main__'}`;
}

/**
 * Per-worktree autoloop state for multi-project/worktree support
 */
interface ProjectAutoLoopState {
  abortController: AbortController;
  config: AutoModeConfig;
  isRunning: boolean;
  consecutiveFailures: { timestamp: number; error: string }[];
  pausedDueToFailures: boolean;
  hasEmittedIdleEvent: boolean;
  branchName: string | null; // null = main worktree
  cooldownTimer: NodeJS.Timeout | null; // Timer for auto-resume after cooldown
  startingFeatures: Set<string>; // Track features being started to prevent race conditions
  humanBlockedCount: number; // Count of features blocked by human-assigned dependencies
}

// ExecutionState is defined in libs/types/src/auto-mode.ts and imported from @protolabsai/types.

// Default empty execution state
const DEFAULT_EXECUTION_STATE: ExecutionState = {
  version: 1,
  autoLoopWasRunning: false,
  maxConcurrency: DEFAULT_MAX_CONCURRENCY,
  projectPath: '',
  branchName: null,
  runningFeatureIds: [],
  savedAt: '',
};

// Duration before auto-resuming a paused loop after circuit-breaker activation
const COOLDOWN_PERIOD_MS = 300_000; // 5 minutes
// Legacy constants for global failure tracking (used by legacy methods only)
const CONSECUTIVE_FAILURE_THRESHOLD = 2; // Pause after 2 consecutive failures (circuit breaker)
const FAILURE_WINDOW_MS = 60000; // Failures within 1 minute count as consecutive

// Auto-loop sleep interval constants — extracted for maintainability and easy tuning
const SLEEP_INTERVAL_CAPACITY_MS = 5000; // Waiting while at max concurrency capacity
const SLEEP_INTERVAL_IDLE_MS = 30000; // Sustained idle polling after idle event emitted
const SLEEP_INTERVAL_NORMAL_MS = 2000; // Normal loop iteration delay
const SLEEP_INTERVAL_ERROR_MS = 5000; // Backoff after a loop iteration error

export class AutoModeService {
  private events: EventEmitter;
  private typedEventBus: TypedEventBus;
  private concurrencyManager: ConcurrencyManager;
  private runningFeatures = new Map<string, RunningFeature>();
  private readonly coordinator = new AutoLoopCoordinator();
  /** Guards against TOCTOU race in startAutoLoopForProject: keys claimed synchronously before any await */
  private readonly pendingLoopStarts = new Set<string>();
  private featureLoader = new FeatureLoader();
  // Legacy single-project properties (kept for backward compatibility during transition)
  private autoLoopRunning = false;
  private autoLoopAbortController: AbortController | null = null;
  private config: AutoModeConfig | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  // Track retry timers so they can be cancelled on shutdown
  private retryTimers = new Map<string, NodeJS.Timeout>();
  private settingsService: SettingsService | null = null;
  // Track consecutive failures to detect quota/API issues (legacy global)
  private consecutiveFailures: { timestamp: number; error: string }[] = [];
  private pausedDueToFailures = false;
  // Track if idle event has been emitted (legacy global)
  private hasEmittedIdleEvent = false;
  // Recovery service for automatic failure recovery
  private recoveryService: RecoveryService;
  // Feature state manager for persist-before-emit status updates
  private featureStateManager!: FeatureStateManager;
  // Authority service for policy-gated feature mutations (optional)
  private authorityService: AuthorityService | null = null;
  // Data integrity watchdog service for monitoring feature count (optional)
  private integrityWatchdogService: DataIntegrityWatchdogService | null = null;
  // Lead Engineer service for delegated feature execution (optional)
  private leadEngineerService: LeadEngineerService | null = null;
  // Knowledge Store service for learning deduplication (optional)
  private knowledgeStoreService: KnowledgeStoreService | null = null;
  // Pipeline Checkpoint service for crash recovery checkpoint cleanup (optional)
  private pipelineCheckpointService: PipelineCheckpointService | null = null;
  // ExecutionService handles feature execution logic
  private executionService!: ExecutionService;
  // Track which projects have already been checked for interrupted features this server lifecycle.
  // Prevents the UI from re-triggering resumeInterruptedFeatures on every board mount.
  private resumeCheckedProjects = new Set<string>();
  // Memory management thresholds (configurable via env vars)
  private readonly HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD = parseFloat(
    process.env.HEAP_STOP_THRESHOLD || '0.8'
  ); // Default 80%
  private readonly HEAP_USAGE_ABORT_AGENTS_THRESHOLD = parseFloat(
    process.env.HEAP_ABORT_THRESHOLD || '0.9'
  ); // Default 90%

  constructor(events: EventEmitter, settingsService?: SettingsService) {
    this.events = events;
    this.typedEventBus = new TypedEventBus(events);
    this.concurrencyManager = new ConcurrencyManager();
    this.settingsService = settingsService ?? null;
    this.recoveryService = getRecoveryService(events);
    this.featureStateManager = new FeatureStateManager(this.events, this.featureLoader);

    // Initialize ExecutionService with all dependencies and callbacks
    const callbacks: IAutoModeCallbacks = {
      loadFeature: this.loadFeature.bind(this),
      contextExists: this.contextExists.bind(this),
      resumeFeature: this.resumeFeature.bind(this),
      findExistingWorktreeForBranch: this.findExistingWorktreeForBranch.bind(this),
      createWorktreeForBranch: this.createWorktreeForBranch.bind(this),
      getModelForFeature: this.getModelForFeature.bind(this),
      saveExecutionState: this.saveExecutionState.bind(this),
      getAutoLoopRunning: () => this.autoLoopRunning,
      updateFeatureStatus: this.updateFeatureStatus.bind(this),
      updateFeaturePlanSpec: this.updateFeaturePlanSpec.bind(this),
      emitAutoModeEvent: this.emitAutoModeEvent.bind(this),
      recordSuccessForProject: this.recordSuccessForProject.bind(this),
      trackFailureAndCheckPauseForProject: this.trackFailureAndCheckPauseForProject.bind(this),
      signalShouldPauseForProject: this.signalShouldPauseForProject.bind(this),
      waitForPlanApproval: this.waitForPlanApproval.bind(this),
      cancelPlanApproval: this.cancelPlanApproval.bind(this),
    };
    this.executionService = new ExecutionService(
      this.events,
      this.settingsService,
      this.featureLoader,
      this.authorityService,
      this.recoveryService,
      this.knowledgeStoreService,
      this.runningFeatures,
      this.retryTimers,
      this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD,
      this.HEAP_USAGE_ABORT_AGENTS_THRESHOLD,
      callbacks
    );

    // Stop running agents when their feature reaches a terminal state.
    // This prevents zombie agents from continuing to run (and consume API budget)
    // after a feature is marked done/verified externally (MCP, manual update, epic merge).
    this.events.subscribe((type, payload) => {
      if (type === 'feature:status-changed') {
        const data = payload as {
          featureId?: string;
          newStatus?: string;
          projectPath?: string;
        };
        if (data.featureId && (data.newStatus === 'done' || data.newStatus === 'verified')) {
          if (this.runningFeatures.has(data.featureId)) {
            logger.info(
              `Stopping agent for completed feature ${data.featureId} (→ ${data.newStatus})`
            );
            void this.stopFeature(data.featureId);
          }

          // Auto-unblock: Check if any features were waiting on this as a human-blocked dependency
          void this.handleFeatureCompletion(data.featureId, data.projectPath);
        }
      }
    });
  }

  /**
   * Wire up the authority service for policy-gated feature execution.
   * When set, auto-mode will check policies before starting features.
   */
  setAuthorityService(service: AuthorityService): void {
    this.authorityService = service;
  }

  /**
   * Wire up the data integrity watchdog service.
   * When set, auto-mode will check data integrity before starting.
   */
  setIntegrityWatchdogService(service: DataIntegrityWatchdogService): void {
    this.integrityWatchdogService = service;
  }

  /**
   * Wire up the Lead Engineer service for delegated feature execution.
   * When set, auto-mode will delegate feature processing to the state machine.
   */
  setLeadEngineerService(service: LeadEngineerService): void {
    this.leadEngineerService = service;
  }

  /**
   * Wire up the Knowledge Store service for learning deduplication.
   * When set, auto-mode will check for duplicate learnings before appending to memory files.
   */
  setKnowledgeStoreService(service: KnowledgeStoreService): void {
    this.knowledgeStoreService = service;
  }

  /**
   * Wire up the Pipeline Checkpoint service for crash recovery checkpoint cleanup.
   * When set, reconcileFeatureStates() will also delete checkpoints for reset features.
   */
  setPipelineCheckpointService(service: PipelineCheckpointService): void {
    this.pipelineCheckpointService = service;
  }

  /**
   * Wire up the Feature Health service for periodic health sweeps in auto-mode.
   * When set, the auto-loop runs board audits every ~100s and escalates issues.
   */
  private featureHealthService: import('./feature-health-service.js').FeatureHealthService | null =
    null;

  setFeatureHealthService(
    service: import('./feature-health-service.js').FeatureHealthService
  ): void {
    this.featureHealthService = service;
  }

  /**
   * Determine the appropriate model for a feature based on complexity, failure count,
   * and user-configured agentExecutionModel setting.
   *
   * Returns both model string and optional providerId so callers can thread
   * the provider through to runAgent() for explicit provider resolution.
   *
   * Priority order:
   * 1. Feature explicitly specifies a model → use it
   * 2. Failure escalation (2+ failures) → opus
   * 3. Architectural complexity → opus
   * 4. User-configured agentExecutionModel from settings
   * 5. Complexity-based fallback (small → haiku, default → sonnet)
   */
  private async getModelForFeature(
    feature: { model?: string; complexity?: string; failureCount?: number },
    projectPath?: string
  ): Promise<{ model: string; providerId?: string }> {
    // 1. Feature explicitly specifies a model → use it (highest priority)
    if (feature.model) {
      return { model: resolveModelString(feature.model, DEFAULT_MODELS.autoMode) };
    }

    // 2. Escalate to opus after multiple failures (safety net)
    if (feature.failureCount && feature.failureCount >= 2) {
      logger.info(`Escalating to opus after ${feature.failureCount} failures`);
      return { model: DEFAULT_MODELS.claude }; // opus
    }

    // 3. Architectural complexity always gets opus
    if (feature.complexity === 'architectural') {
      logger.info('Using opus for architectural feature');
      return { model: DEFAULT_MODELS.claude }; // opus
    }

    // 4. Read user's configured agent execution model from settings
    try {
      const { phaseModel } = await getPhaseModelWithOverrides(
        'agentExecutionModel',
        this.settingsService,
        projectPath
      );
      if (phaseModel?.model) {
        return {
          model: resolveModelString(phaseModel.model, DEFAULT_MODELS.autoMode),
          providerId: phaseModel.providerId,
        };
      }
    } catch (err) {
      logger.warn(`Failed to read agentExecutionModel setting, using fallback: ${err}`);
    }

    // 5. Fallback: complexity-based (only if no setting configured)
    if (feature.complexity === 'small') {
      logger.info('Using haiku for small feature');
      return { model: DEFAULT_MODELS.trivial }; // haiku
    }

    return { model: DEFAULT_MODELS.autoMode }; // sonnet
  }

  /**
   * Track a failure and check if we should pause due to consecutive failures.
   * This handles cases where the SDK doesn't return useful error messages.
   * @param projectPath - The project to track failure for
   * @param errorInfo - Error information
   */
  private trackFailureAndCheckPauseForProject(
    projectPath: string,
    branchName: string | null,
    errorInfo: { type: string; message: string }
  ): boolean {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const hasState = this.coordinator.getState(worktreeKey) !== undefined;
    if (!hasState) {
      // Fall back to legacy global tracking
      return this.trackFailureAndCheckPause(errorInfo);
    }

    // Immediately pause for critical errors that should trigger circuit breaker
    if (
      errorInfo.type === 'quota_exhausted' ||
      errorInfo.type === 'rate_limit' ||
      errorInfo.type === 'network'
    ) {
      return true;
    }

    return this.coordinator.trackFailure(worktreeKey, errorInfo.message);
  }

  /**
   * Track a failure and check if we should pause due to consecutive failures (legacy global).
   */
  private trackFailureAndCheckPause(errorInfo: { type: string; message: string }): boolean {
    const now = Date.now();

    // Add this failure
    this.consecutiveFailures.push({ timestamp: now, error: errorInfo.message });

    // Remove old failures outside the window
    this.consecutiveFailures = this.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );

    // Check if we've hit the threshold
    if (this.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
      return true; // Should pause
    }

    // Immediately pause for critical errors that should trigger circuit breaker
    if (
      errorInfo.type === 'quota_exhausted' ||
      errorInfo.type === 'rate_limit' ||
      errorInfo.type === 'network'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Signal that we should pause due to repeated failures or quota exhaustion.
   * This will pause the auto loop for a specific project.
   * @param projectPath - The project to pause
   * @param errorInfo - Error information
   */
  private signalShouldPauseForProject(
    projectPath: string,
    branchName: string | null,
    errorInfo: { type: string; message: string }
  ): void {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const projectState = this.coordinator.getState(worktreeKey);
    if (!projectState) {
      // Fall back to legacy global pause
      this.signalShouldPause(errorInfo);
      return;
    }

    if (projectState.isPaused) {
      return; // Already paused
    }

    projectState.isPaused = true;
    const failureCount = projectState.failureTimestamps.length;
    logger.info(
      `Circuit breaker triggered for ${projectPath} after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
    );

    // Emit event to notify UI
    const cooldownMinutes = Math.floor(COOLDOWN_PERIOD_MS / 60000);
    this.emitAutoModeEvent('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected. Circuit breaker activated. Auto-resume in ${cooldownMinutes} minutes.`
          : `Auto Mode paused: Critical error detected (${errorInfo.type}). Circuit breaker activated. Auto-resume in ${cooldownMinutes} minutes.`,
      errorType: errorInfo.type,
      originalError: errorInfo.message,
      failureCount,
      projectPath,
      cooldownMs: COOLDOWN_PERIOD_MS,
    });

    // Pause (not stop) the loop — keeps state in the coordinator map so the
    // cooldown timer reference remains valid and autoResumeAfterCooldown can
    // find the state via getState().  stopAutoLoopForProject deletes state,
    // which caused the cooldown timer to write to a dangling reference and
    // auto-resume to silently fail.
    this.coordinator.pauseLoop(worktreeKey);

    // Clear retry timers for features in this project to prevent zombie restarts
    for (const [featureId, timer] of this.retryTimers) {
      const running = this.runningFeatures.get(featureId);
      if (running && running.projectPath === projectPath) {
        clearTimeout(timer);
        this.retryTimers.delete(featureId);
      }
    }

    // Schedule auto-resume after cooldown period
    projectState.cooldownTimer = setTimeout(() => {
      this.autoResumeAfterCooldown(projectPath, branchName);
    }, COOLDOWN_PERIOD_MS);
  }

  /**
   * Auto-resume auto-mode after cooldown period
   * @param projectPath - The project to resume
   */
  private async autoResumeAfterCooldown(
    projectPath: string,
    branchName: string | null = null
  ): Promise<void> {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const projectState = this.coordinator.getState(worktreeKey);
    if (!projectState || !projectState.isPaused) {
      return; // No longer paused or doesn't exist
    }

    logger.info(`Auto-resuming auto loop for ${projectPath} after cooldown period`);

    // Reset failure tracking
    this.coordinator.resetFailures(worktreeKey);
    projectState.cooldownTimer = null;

    // Notify user about auto-resume
    this.emitAutoModeEvent('auto_mode_resumed', {
      message: 'Circuit breaker cooldown complete. Auto Mode resuming...',
      projectPath,
      reason: 'cooldown_complete',
    });

    // Restart auto-mode with the same configuration
    try {
      await this.startAutoLoopForProject(
        projectPath,
        projectState.branchName ?? null,
        projectState.config.maxConcurrency
      );
    } catch (error) {
      logger.error('Failed to auto-resume after cooldown:', error);
      this.emitAutoModeEvent('auto_mode_error', {
        message: 'Failed to auto-resume after cooldown',
        error: error instanceof Error ? error.message : String(error),
        projectPath,
      });
    }
  }

  /**
   * Signal that we should pause due to repeated failures or quota exhaustion (legacy global).
   */
  private signalShouldPause(errorInfo: { type: string; message: string }): void {
    if (this.pausedDueToFailures) {
      return; // Already paused
    }

    this.pausedDueToFailures = true;
    const failureCount = this.consecutiveFailures.length;
    logger.info(
      `Pausing auto loop after ${failureCount} consecutive failures. Last error: ${errorInfo.type}`
    );

    // Emit event to notify UI
    this.emitAutoModeEvent('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected. This may indicate a quota limit or API issue. Please check your usage and try again.`
          : 'Auto Mode paused: Usage limit or API error detected. Please wait for your quota to reset or check your API configuration.',
      errorType: errorInfo.type,
      originalError: errorInfo.message,
      failureCount,
      projectPath: this.config?.projectPath,
    });

    // Stop the auto loop
    this.stopAutoLoop();
  }

  /**
   * Reset failure tracking for a specific project
   * @param projectPath - The project to reset failure tracking for
   * @param branchName - The branch name, or null for main worktree
   */
  private resetFailureTrackingForProject(
    projectPath: string,
    branchName: string | null = null
  ): void {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    this.coordinator.resetFailures(worktreeKey);
  }

  /**
   * Reset failure tracking (called when user manually restarts auto mode) - legacy global
   */
  private resetFailureTracking(): void {
    this.consecutiveFailures = [];
    this.pausedDueToFailures = false;
  }

  /**
   * Record a successful feature completion to reset consecutive failure count for a project
   * @param projectPath - The project to record success for
   * @param branchName - The branch name, or null for main worktree
   */
  private recordSuccessForProject(projectPath: string, branchName: string | null = null): void {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    this.coordinator.resetFailures(worktreeKey);
  }

  /**
   * Record a successful feature completion to reset consecutive failure count - legacy global
   */
  private recordSuccess(): void {
    this.consecutiveFailures = [];
  }

  /**
   * Handle auto-unblock: when a feature is completed, check if any features were
   * waiting on it as a human-blocked dependency and auto-transition them to backlog
   */
  private async handleFeatureCompletion(
    completedFeatureId: string,
    projectPath?: string
  ): Promise<void> {
    if (!projectPath) {
      logger.debug(
        `No projectPath provided for completed feature ${completedFeatureId}, skipping auto-unblock`
      );
      return;
    }

    try {
      // Load all features for this project
      const allFeatures = await this.featureLoader.getAll(projectPath);
      if (!allFeatures || allFeatures.length === 0) {
        return;
      }

      // Find features that were human-blocked by this completed feature
      const unblockedFeatures: Array<{ featureId: string; featureTitle: string }> = [];

      for (const feature of allFeatures) {
        // Skip if not human-blocked
        if (feature.status !== 'human-blocked') {
          continue;
        }

        // Check if this feature was blocked by the completed feature
        const blockingInfo = getBlockingInfo(feature, allFeatures);
        if (blockingInfo.humanBlockers.includes(completedFeatureId)) {
          // Re-check blocking after removing the completed feature
          // to see if the feature is still blocked
          const updatedBlockingInfo = getBlockingInfo(
            feature,
            allFeatures.filter((f: Feature) => f.id !== completedFeatureId)
          );

          // If no longer blocked, transition to backlog
          if (updatedBlockingInfo.humanBlockers.length === 0) {
            logger.info(
              `Auto-unblocking feature ${feature.id} (was blocked by completed feature ${completedFeatureId})`
            );

            // Transition to backlog
            await this.updateFeatureStatus(projectPath, feature.id, 'backlog');

            unblockedFeatures.push({
              featureId: feature.id,
              featureTitle: feature.title || feature.description || feature.id,
            });
          }
        }
      }

      // Emit feature:unblocked event for each unblocked feature
      if (unblockedFeatures.length > 0) {
        for (const unblocked of unblockedFeatures) {
          this.events.emit('feature:unblocked' as EventType, {
            featureId: unblocked.featureId,
            featureTitle: unblocked.featureTitle,
            completedDependencyId: completedFeatureId,
            projectPath,
            timestamp: new Date().toISOString(),
          });

          logger.info(
            `Feature ${unblocked.featureId} auto-unblocked and moved to backlog (dependency ${completedFeatureId} completed)`
          );
        }
      }
    } catch (error) {
      logger.error(`Error in auto-unblock for completed feature ${completedFeatureId}:`, error);
    }
  }

  private async resolveMaxConcurrency(
    projectPath: string,
    branchName: string | null,
    provided?: number
  ): Promise<number> {
    let resolvedValue: number;

    if (typeof provided === 'number' && Number.isFinite(provided)) {
      resolvedValue = provided;
    } else if (!this.settingsService) {
      resolvedValue = DEFAULT_MAX_CONCURRENCY;
    } else {
      try {
        const settings = await this.settingsService.getGlobalSettings();
        const globalMax =
          typeof settings.maxConcurrency === 'number'
            ? settings.maxConcurrency
            : DEFAULT_MAX_CONCURRENCY;
        const projectId = settings.projects?.find((project) => project.path === projectPath)?.id;
        const autoModeByWorktree = settings.autoModeByWorktree;

        if (projectId && autoModeByWorktree && typeof autoModeByWorktree === 'object') {
          const key = `${projectId}::${branchName ?? '__main__'}`;
          const entry = autoModeByWorktree[key];
          if (entry && typeof entry.maxConcurrency === 'number') {
            resolvedValue = entry.maxConcurrency;
          } else {
            resolvedValue = globalMax;
          }
        } else {
          resolvedValue = globalMax;
        }
      } catch {
        resolvedValue = DEFAULT_MAX_CONCURRENCY;
      }
    }

    // Enforce hard system limit to prevent resource exhaustion
    if (resolvedValue > MAX_SYSTEM_CONCURRENCY) {
      logger.warn(
        `maxConcurrency ${resolvedValue} exceeds system limit of ${MAX_SYSTEM_CONCURRENCY}, capping to ${MAX_SYSTEM_CONCURRENCY}`
      );
      return MAX_SYSTEM_CONCURRENCY;
    }

    return resolvedValue;
  }

  /**
   * Start the auto mode loop for a specific project/worktree (supports multiple concurrent projects and worktrees)
   * @param projectPath - The project to start auto mode for
   * @param branchName - The branch name for worktree scoping, null for main worktree
   * @param maxConcurrency - Maximum concurrent features (default: DEFAULT_MAX_CONCURRENCY)
   */
  async startAutoLoopForProject(
    projectPath: string,
    branchName: string | null = null,
    maxConcurrency?: number,
    forceStart: boolean = false
  ): Promise<number> {
    // Check data integrity before starting (unless force-start is enabled)
    if (this.integrityWatchdogService) {
      const canStart = await this.integrityWatchdogService.canStartAutoMode(
        projectPath,
        forceStart
      );

      if (!canStart) {
        const status = await this.integrityWatchdogService.getStatus(projectPath);
        throw new Error(
          `Auto-mode blocked due to data integrity breach. Feature count dropped from ${status.lastKnownCount} to ${status.currentCount}. Use force-start flag to bypass.`
        );
      }
    }

    // Compute key early so we can synchronously claim it before any await.
    // This prevents the TOCTOU race where concurrent callers all pass the
    // isRunning check before coordinator.startLoop() sets isRunning = true.
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';

    if (this.coordinator.isRunning(worktreeKey) || this.pendingLoopStarts.has(worktreeKey)) {
      throw new Error(
        `Auto mode is already running for ${worktreeDesc} in project: ${projectPath}`
      );
    }
    // Claim the slot synchronously — no await can occur between here and the add,
    // so no concurrent caller can sneak through in the same event-loop turn.
    this.pendingLoopStarts.add(worktreeKey);

    const resolvedMaxConcurrency = await this.resolveMaxConcurrency(
      projectPath,
      branchName,
      maxConcurrency
    );

    const config: AutoModeLoopConfig = {
      maxConcurrency: resolvedMaxConcurrency,
      useWorktrees: true,
      projectPath,
      branchName,
    };

    try {
      logger.info(
        `Starting auto loop for ${worktreeDesc} in project: ${projectPath} with maxConcurrency: ${resolvedMaxConcurrency}`
      );

      this.emitAutoModeEvent('auto_mode_started', {
        message: `Auto mode started with max ${resolvedMaxConcurrency} concurrent features`,
        projectPath,
        branchName,
        maxConcurrency: resolvedMaxConcurrency,
      });

      // Save execution state for recovery after restart
      await this.saveExecutionStateForProject(projectPath, branchName, resolvedMaxConcurrency);

      // Delegate loop lifecycle to coordinator
      this.coordinator.startLoop(worktreeKey, config, (state) =>
        this.runAutoLoopForProject(worktreeKey, state)
      );

      return resolvedMaxConcurrency;
    } catch (error) {
      // If initialization fails, clean up the state we just set
      this.coordinator.stopLoop(worktreeKey);
      throw error;
    } finally {
      // Release the pending claim regardless of outcome so the key can be reused
      this.pendingLoopStarts.delete(worktreeKey);
    }
  }

  /**
   * Run the auto loop for a specific project/worktree
   * @param worktreeKey - The worktree key (projectPath::branchName or projectPath::__main__)
   */
  private async runAutoLoopForProject(worktreeKey: string, loopState?: LoopState): Promise<void> {
    const projectState = loopState ?? this.coordinator.getState(worktreeKey);
    if (!projectState) {
      logger.warn(`No project state found for ${worktreeKey}, stopping loop`);
      return;
    }

    const { projectPath, branchName } = projectState.config;
    const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';

    logger.info(
      `[AutoLoop] Starting loop for ${worktreeDesc} in ${projectPath}, maxConcurrency: ${projectState.config.maxConcurrency}`
    );
    let iterationCount = 0;

    // Configurable startup delay before first agent launch (default 10s, 0 to disable)
    const startupDelayMs = parseInt(process.env.AUTO_MODE_STARTUP_DELAY_MS || '10000', 10);
    if (startupDelayMs > 0) {
      logger.info(
        `[AutoLoop] Startup cooldown: waiting ${startupDelayMs}ms before first agent launch`
      );
      await this.sleep(startupDelayMs, projectState.abortController.signal);
      if (!projectState.isRunning || projectState.abortController.signal.aborted) {
        logger.info(`[AutoLoop] Auto-mode stopped during startup cooldown for ${worktreeDesc}`);
        return;
      }
      const heapUsage = this.getHeapUsagePercent();
      if (heapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[AutoLoop] Heap at ${Math.round(heapUsage * 100)}% after cooldown, stopping auto-mode for ${worktreeDesc}`
        );
        projectState.isRunning = false;
        return;
      }
    }

    while (projectState.isRunning && !projectState.abortController.signal.aborted) {
      iterationCount++;
      logger.debug(
        `[AutoLoop] 💓 Heartbeat - Iteration ${iterationCount} for ${worktreeDesc} in ${projectPath}`
      );

      // Periodic health sweep (every ~100 seconds at 2s interval)
      if (iterationCount % 50 === 0 && this.featureHealthService) {
        try {
          const report = await this.featureHealthService.audit(projectPath, true);
          if (report.issues.length > 0) {
            logger.warn(
              `[AutoLoop] Health sweep found ${report.issues.length} issues, fixed ${report.fixed.length}`
            );
            for (const issue of report.issues) {
              this.events.emit(
                'escalation:signal-received' as import('@protolabsai/types').EventType,
                {
                  source: 'auto_mode_health_sweep',
                  severity: issue.type === 'stale_gate' ? 'medium' : 'low',
                  type: issue.type,
                  context: {
                    featureId: issue.featureId,
                    featureTitle: issue.featureTitle,
                    message: issue.message,
                    fix: issue.fix,
                    projectPath,
                  },
                  deduplicationKey: `health_${issue.type}_${issue.featureId}_${projectPath}`,
                  timestamp: new Date().toISOString(),
                }
              );
            }
          }
        } catch (err) {
          logger.warn('[AutoLoop] Health sweep failed:', err);
        }
      }

      // Early heap check — prevent any work when memory is critical
      const earlyHeapUsage = this.getHeapUsagePercent();
      if (earlyHeapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[AutoLoop] High heap (${Math.round(earlyHeapUsage * 100)}%), deferring iteration for ${worktreeDesc}`
        );
        await this.sleep(10000, projectState.abortController.signal);
        continue;
      }

      try {
        // Count running features for THIS project/worktree only
        const projectRunningCount = await this.getRunningCountForWorktree(projectPath, branchName);

        // Count features that are in the process of being started
        const startingCount = projectState.startingFeatures.size;

        // Total occupied slots = running + starting
        const totalOccupied = projectRunningCount + startingCount;

        // Check if we have capacity for this project/worktree
        if (totalOccupied >= projectState.config.maxConcurrency) {
          logger.debug(
            `[AutoLoop] At capacity (${projectRunningCount} running + ${startingCount} starting = ${totalOccupied}/${projectState.config.maxConcurrency}), waiting...`
          );
          await this.sleep(SLEEP_INTERVAL_CAPACITY_MS);
          continue;
        }

        // Load pending features for this project/worktree
        const pendingFeatures = await this.loadPendingFeatures(projectPath, branchName);

        logger.info(
          `[AutoLoop] Iteration ${iterationCount}: Found ${pendingFeatures.length} pending features, ${projectRunningCount}/${projectState.config.maxConcurrency} running for ${worktreeDesc}`
        );

        if (pendingFeatures.length === 0) {
          // Emit idle event only once when backlog is empty, no agents are running,
          // AND no features are in_progress (guards against the transition window where
          // a feature has just finished but its status hasn't flipped to done yet).
          const inProgress = await this.hasInProgressFeatures(projectPath, branchName);
          if (projectRunningCount === 0 && !inProgress && !projectState.hasEmittedIdleEvent) {
            this.emitAutoModeEvent('auto_mode_idle', {
              message: 'No pending features - auto mode idle',
              projectPath,
              branchName,
            });
            projectState.hasEmittedIdleEvent = true;
            logger.info(`[AutoLoop] Backlog complete, auto mode now idle for ${worktreeDesc}`);
          } else if (projectRunningCount > 0) {
            logger.info(
              `[AutoLoop] No pending features available, ${projectRunningCount} still running, waiting...`
            );
          } else if (inProgress) {
            logger.info(
              `[AutoLoop] No pending features available but features still in_progress, waiting for status transition...`
            );
          } else if (projectState.hasEmittedIdleEvent) {
            // Still idle — keep polling at reduced frequency so we pick up
            // features that become unblocked when dependencies complete.
            logger.debug(
              `[AutoLoop] Still idle for ${worktreeDesc}, polling again in ${SLEEP_INTERVAL_IDLE_MS / 1000}s...`
            );
          }
          // Longer sleep when idle to reduce filesystem reads; pass abort signal
          // so stopAutoLoopForProject() remains responsive even during idle sleep
          await this.sleep(
            projectState.hasEmittedIdleEvent ? SLEEP_INTERVAL_IDLE_MS : 10000,
            projectState.abortController.signal
          );
          continue;
        }

        // Find a feature not currently running, not being started, and not yet finished
        const nextFeature = pendingFeatures.find(
          (f) =>
            !this.runningFeatures.has(f.id) &&
            !projectState.startingFeatures.has(f.id) &&
            !this.isFeatureFinished(f)
        );

        // Log selection details for debugging
        logger.info(
          `[AutoLoop] Feature selection from ${pendingFeatures.length} pending: ${pendingFeatures.map((f) => `${f.id}(running:${this.runningFeatures.has(f.id)},finished:${this.isFeatureFinished(f)})`).join(', ')}`
        );

        if (nextFeature) {
          // Check heap usage before starting new agents
          const heapUsage = this.getHeapUsagePercent();

          // At 90% heap usage, abort most recent agent to free memory
          if (heapUsage >= this.HEAP_USAGE_ABORT_AGENTS_THRESHOLD) {
            const mostRecent = this.getMostRecentRunningFeature(projectPath);
            if (mostRecent && mostRecent.abortController) {
              logger.warn(
                `[AutoLoop] Critical heap usage (${Math.round(heapUsage * 100)}%), aborting most recent agent: ${mostRecent.featureId}`
              );
              mostRecent.abortController.abort();
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId: mostRecent.featureId,
                message: `⚠️ Agent aborted due to critical memory usage (${Math.round(heapUsage * 100)}%)`,
                projectPath,
              });
            } else {
              logger.warn(
                `[AutoLoop] Critical heap usage (${Math.round(heapUsage * 100)}%), deferring agent start (no running agents to abort)`
              );
            }
            await this.sleep(2000);
            continue;
          }

          // At 80% heap usage, stop accepting new agents
          if (heapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
            logger.warn(
              `[AutoLoop] High heap usage (${Math.round(heapUsage * 100)}%), deferring new agent start`
            );
            await this.sleep(5000);
            continue;
          }

          // Double-check we're not at capacity (defensive check before starting)
          const currentRunningCount = await this.getRunningCountForWorktree(
            projectPath,
            branchName
          );
          const currentStartingCount = projectState.startingFeatures.size;
          const currentTotalOccupied = currentRunningCount + currentStartingCount;

          if (currentTotalOccupied >= projectState.config.maxConcurrency) {
            logger.warn(
              `[AutoLoop] Race condition detected: at capacity ${currentRunningCount} running + ${currentStartingCount} starting = ${currentTotalOccupied}/${projectState.config.maxConcurrency} when trying to start feature ${nextFeature.id}, skipping`
            );
            await this.sleep(1000);
            continue;
          }

          // Guard: content features (featureType === 'content') must route through
          // leadEngineerService to the GTM execution path. They must NOT be launched
          // with the standard code agent. If leadEngineerService is not available, skip them.
          if (nextFeature.featureType === 'content' && !this.leadEngineerService) {
            logger.warn(
              `[AutoLoop] Skipping content feature ${nextFeature.id} ("${nextFeature.title}") — LeadEngineerService required for GTM execution path`
            );
            await this.sleep(2000);
            continue;
          }

          // Mark feature as starting BEFORE calling executeFeature to prevent race conditions
          projectState.startingFeatures.add(nextFeature.id);

          logger.info(`[AutoLoop] Starting feature ${nextFeature.id}: ${nextFeature.title}`);
          // Reset idle event flag since we're doing work again
          projectState.hasEmittedIdleEvent = false;

          // Safety timeout: Remove from starting set after 30 seconds if still there
          // This prevents features from getting permanently stuck in "starting" state
          const startingTimeout = setTimeout(() => {
            if (projectState.startingFeatures.has(nextFeature.id)) {
              logger.warn(
                `[AutoLoop] Feature ${nextFeature.id} stuck in starting state for 30s, cleaning up`
              );
              projectState.startingFeatures.delete(nextFeature.id);
            }
          }, 30000);

          // Start feature execution in background.
          // Content features (featureType === 'content') always route through leadEngineerService
          // to the GTM execution path (guarded above — leadEngineerService is non-null here).
          // Code features use leadEngineerService if available, otherwise fall back to executeFeature.
          const featureModelResult = await this.getModelForFeature(nextFeature, projectPath);
          const executionPromise = this.leadEngineerService
            ? this.leadEngineerService.process(projectPath, nextFeature.id, {
                model: featureModelResult.model,
              } as unknown as ExecuteOptions) // State machine builds full ExecuteOptions internally
            : this.executeFeature(
                projectPath,
                nextFeature.id,
                projectState.config.useWorktrees,
                true
              );

          executionPromise
            .then(() => {
              // Remove from starting set once execution completes (successfully or not)
              clearTimeout(startingTimeout);
              projectState.startingFeatures.delete(nextFeature.id);
            })
            .catch((error: unknown) => {
              logger.error(`Feature ${nextFeature.id} error:`, error);
              // Remove from starting set on error
              clearTimeout(startingTimeout);
              projectState.startingFeatures.delete(nextFeature.id);
              // Notify circuit breaker — without this, LE failures loop forever
              const errorInfo = classifyError(error);
              if (!errorInfo.isCancellation) {
                const shouldPause = this.trackFailureAndCheckPauseForProject(
                  projectPath,
                  branchName,
                  errorInfo
                );
                if (shouldPause) {
                  this.signalShouldPauseForProject(projectPath, branchName, errorInfo);
                }
              }
            });

          // Brief sleep to ensure proper sequencing
          await this.sleep(100);
        } else {
          logger.debug(`[AutoLoop] All pending features are already running or being started`);
        }

        await this.sleep(SLEEP_INTERVAL_NORMAL_MS);
      } catch (error) {
        logger.error(`[AutoLoop] Loop iteration error for ${projectPath}:`, error);
        await this.sleep(SLEEP_INTERVAL_ERROR_MS);
      }
    }

    // Mark as not running when loop exits
    projectState.isRunning = false;
    logger.info(
      `[AutoLoop] Loop stopped for project: ${projectPath} after ${iterationCount} iterations`
    );
  }

  /**
   * Get count of running features for a specific project.
   * Delegates to ConcurrencyManager for lease-based tracking.
   */
  private getRunningCountForProject(projectPath: string): number {
    return this.concurrencyManager.getRunningCountForProject(projectPath);
  }

  /**
   * Get count of running features for a specific worktree.
   * Delegates to ConcurrencyManager for lease-based tracking.
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree (counts all running features for project)
   */
  private async getRunningCountForWorktree(
    projectPath: string,
    branchName: string | null
  ): Promise<number> {
    return this.concurrencyManager.getRunningCountForWorktree(projectPath, branchName);
  }

  /**
   * Check whether any features for this project/worktree are currently in `in_progress` status.
   *
   * This guard prevents a false-positive `auto_mode_idle` emission during the transition
   * window where a feature's agent has finished (running count = 0) but its status on disk
   * has not yet flipped from `in_progress` to `done`.
   *
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  private async hasInProgressFeatures(
    projectPath: string,
    branchName: string | null
  ): Promise<boolean> {
    try {
      const allFeatures = await this.featureLoader.getAll(projectPath);
      return allFeatures.some((f) => {
        if (f.status !== 'in_progress') return false;
        // Apply the same worktree-scoping as loadPendingFeatures
        if (branchName === null) {
          // Main worktree: features with no branchName or explicitly 'main'
          return !f.branchName || f.branchName === 'main';
        }
        return f.branchName === branchName;
      });
    } catch {
      // If we can't load features, assume none are in_progress (non-fatal)
      return false;
    }
  }

  /**
   * Stop the auto mode loop for a specific project/worktree
   * @param projectPath - The project to stop auto mode for
   * @param branchName - The branch name, or null for main worktree
   */
  async stopAutoLoopForProject(
    projectPath: string,
    branchName: string | null = null
  ): Promise<number> {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const stoppedState = this.coordinator.stopLoop(worktreeKey);
    if (!stoppedState) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.warn(`No auto loop running for ${worktreeDesc} in project: ${projectPath}`);
      return 0;
    }

    const wasRunning = stoppedState.isRunning || stoppedState.isPaused;

    // Clear retry timers for features in this project to prevent zombie restarts
    for (const [featureId, timer] of this.retryTimers) {
      const running = this.runningFeatures.get(featureId);
      if (running && running.projectPath === projectPath) {
        clearTimeout(timer);
        this.retryTimers.delete(featureId);
        logger.info(`Cancelled retry timer for feature ${featureId} during auto-loop stop`);
      }
    }

    // Clear execution state when auto-loop is explicitly stopped
    await this.clearExecutionState(projectPath, branchName);

    // Emit stop event
    if (wasRunning) {
      this.emitAutoModeEvent('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath,
        branchName,
      });
    }

    return await this.getRunningCountForWorktree(projectPath, branchName);
  }

  /**
   * Check if auto mode is running for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  isAutoLoopRunningForProject(projectPath: string, branchName: string | null = null): boolean {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    return this.coordinator.isRunning(worktreeKey);
  }

  /**
   * Pause the auto loop for a specific project/worktree (circuit-breaker / external control).
   * The loop is stopped and its state is retained so it can be resumed via resumeAutoLoopForProject.
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   * @returns true if the loop was found and paused, false if no loop was running
   */
  pauseAutoLoopForProject(projectPath: string, branchName: string | null = null): boolean {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const paused = this.coordinator.pauseLoop(worktreeKey);
    if (paused) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(`[AutoLoop] Loop paused externally for ${worktreeDesc} in ${projectPath}`);
      this.emitAutoModeEvent('auto_mode_paused', {
        message: 'Auto mode paused',
        projectPath,
        branchName,
      });
    }
    return paused;
  }

  /**
   * Resume a paused auto loop for a specific project/worktree.
   * Creates a fresh loop with the same configuration.
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   * @returns true if the loop was resumed, false if no paused loop was found
   */
  resumeAutoLoopForProject(projectPath: string, branchName: string | null = null): boolean {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const existingState = this.coordinator.getState(worktreeKey);
    if (!existingState) {
      return false;
    }

    const { config } = existingState;
    const resumed = this.coordinator.resumeLoop(worktreeKey, config, (state) =>
      this.runAutoLoopForProject(worktreeKey, state)
    );

    if (resumed) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(`[AutoLoop] Loop resumed for ${worktreeDesc} in ${projectPath}`);
      this.emitAutoModeEvent('auto_mode_resumed', {
        message: 'Auto mode resumed',
        projectPath,
        branchName,
        reason: 'external_resume',
      });
    }
    return !!resumed;
  }

  /**
   * Get auto loop config for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  getAutoLoopConfigForProject(
    projectPath: string,
    branchName: string | null = null
  ): AutoModeConfig | null {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    return this.coordinator.getState(worktreeKey)?.config ?? null;
  }

  /**
   * Save execution state for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   * @param maxConcurrency - Maximum concurrent features
   */
  private async saveExecutionStateForProject(
    projectPath: string,
    branchName: string | null,
    maxConcurrency: number
  ): Promise<void> {
    try {
      await ensureAutomakerDir(projectPath);
      const statePath = getExecutionStatePath(projectPath);
      const runningFeatureIds = Array.from(this.runningFeatures.entries())
        .filter(([, f]) => f.projectPath === projectPath)
        .map(([id]) => id);

      const state: ExecutionState = {
        version: 1,
        autoLoopWasRunning: true,
        maxConcurrency,
        projectPath,
        branchName,
        runningFeatureIds,
        savedAt: new Date().toISOString(),
      };
      await secureFs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(
        `Saved execution state for ${worktreeDesc} in ${projectPath}: ${runningFeatureIds.length} running features`
      );
    } catch (error) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.error(`Failed to save execution state for ${worktreeDesc} in ${projectPath}:`, error);
    }
  }

  /**
   * Start the auto mode loop - continuously picks and executes pending features
   * @deprecated Use startAutoLoopForProject instead for multi-project support
   */
  async startAutoLoop(
    projectPath: string,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY
  ): Promise<void> {
    // For backward compatibility, delegate to the new per-project method
    // But also maintain legacy state for existing code that might check it
    if (this.autoLoopRunning) {
      throw new Error('Auto mode is already running');
    }

    // Reset failure tracking when user manually starts auto mode
    this.resetFailureTracking();

    this.autoLoopRunning = true;
    this.autoLoopAbortController = new AbortController();
    this.config = {
      maxConcurrency,
      useWorktrees: true,
      projectPath,
      branchName: null,
    };

    this.emitAutoModeEvent('auto_mode_started', {
      message: `Auto mode started with max ${maxConcurrency} concurrent features`,
      projectPath,
    });

    // Save execution state for recovery after restart
    await this.saveExecutionState(projectPath);

    // Note: Memory folder initialization is now handled by loadContextFiles

    // Run the loop in the background
    this.runAutoLoop().catch((error) => {
      logger.error('Loop error:', error);
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath,
      });
    });
  }

  /**
   * @deprecated Use runAutoLoopForProject instead
   */
  private async runAutoLoop(): Promise<void> {
    while (
      this.autoLoopRunning &&
      this.autoLoopAbortController &&
      !this.autoLoopAbortController.signal.aborted
    ) {
      try {
        // Check if we have capacity
        if (this.runningFeatures.size >= (this.config?.maxConcurrency || DEFAULT_MAX_CONCURRENCY)) {
          await this.sleep(5000);
          continue;
        }

        // Load pending features
        const pendingFeatures = await this.loadPendingFeatures(this.config!.projectPath);

        if (pendingFeatures.length === 0) {
          // Emit idle event only once when backlog is empty AND no features are running
          const runningCount = this.runningFeatures.size;
          if (runningCount === 0 && !this.hasEmittedIdleEvent) {
            this.emitAutoModeEvent('auto_mode_idle', {
              message: 'No pending features - auto mode idle',
              projectPath: this.config!.projectPath,
            });
            this.hasEmittedIdleEvent = true;
            logger.info(`[AutoLoop] Backlog complete, auto mode now idle`);
          } else if (runningCount > 0) {
            logger.debug(
              `[AutoLoop] No pending features, ${runningCount} still running, waiting...`
            );
          } else if (this.hasEmittedIdleEvent) {
            // Still idle — keep polling at reduced frequency so we pick up
            // features that become unblocked when dependencies complete.
            logger.debug(`[AutoLoop] Still idle, polling again in 30s...`);
          }
          // Longer sleep when idle to reduce filesystem reads; pass abort signal
          // so stopAutoLoop() remains responsive even during 30s idle sleep
          await this.sleep(
            this.hasEmittedIdleEvent ? 30000 : 10000,
            this.autoLoopAbortController?.signal
          );
          continue;
        }

        // Find a feature not currently running
        const nextFeature = pendingFeatures.find((f) => !this.runningFeatures.has(f.id));

        if (nextFeature) {
          // Reset idle event flag since we're doing work again
          this.hasEmittedIdleEvent = false;

          // Guard: content features (featureType === 'content') require leadEngineerService
          // for the GTM execution path and must not run via the legacy code agent.
          // Skip them here — they will be picked up by runAutoLoopForProject.
          if (nextFeature.featureType === 'content') {
            logger.warn(
              `[AutoLoop] Skipping content feature ${nextFeature.id} in legacy loop — GTM execution requires per-project auto mode`
            );
            await this.sleep(2000);
            continue;
          }

          // Start feature execution in background
          this.executeFeature(
            this.config!.projectPath,
            nextFeature.id,
            this.config!.useWorktrees,
            true
          ).catch((error) => {
            logger.error(`Feature ${nextFeature.id} error:`, error);
          });
        }

        await this.sleep(2000);
      } catch (error) {
        logger.error('Loop iteration error:', error);
        await this.sleep(5000);
      }
    }

    this.autoLoopRunning = false;
  }

  /**
   * Stop the auto mode loop
   * @deprecated Use stopAutoLoopForProject instead for multi-project support
   */
  async stopAutoLoop(): Promise<number> {
    const wasRunning = this.autoLoopRunning;
    const projectPath = this.config?.projectPath;
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Clear execution state when auto-loop is explicitly stopped
    if (projectPath) {
      await this.clearExecutionState(projectPath);
    }

    // Emit stop event immediately when user explicitly stops
    if (wasRunning) {
      this.emitAutoModeEvent('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath,
      });
    }

    return this.runningFeatures.size;
  }

  /**
   * Check if there's capacity to start a feature on a worktree.
   * This respects per-worktree agent limits from autoModeByWorktree settings.
   *
   * @param projectPath - The main project path
   * @param featureId - The feature ID to check capacity for
   * @returns Object with hasCapacity boolean and details about current/max agents
   */
  async checkWorktreeCapacity(
    projectPath: string,
    featureId: string
  ): Promise<{
    hasCapacity: boolean;
    currentAgents: number;
    maxAgents: number;
    branchName: string | null;
  }> {
    // Load feature to get branchName
    const feature = await this.loadFeature(projectPath, featureId);
    const branchName = feature?.branchName ?? null;

    // Get per-worktree limit
    const maxAgents = await this.resolveMaxConcurrency(projectPath, branchName);

    // Get current running count for this worktree
    const currentAgents = await this.getRunningCountForWorktree(projectPath, branchName);

    return {
      hasCapacity: currentAgents < maxAgents,
      currentAgents,
      maxAgents,
      branchName,
    };
  }

  /**
   * Exposed for unit tests — delegates to ExecutionService.
   */
  getPlanningPromptPrefix(feature: Feature): Promise<string> {
    return this.executionService.getPlanningPromptPrefix(feature);
  }

  /**
   * Execute a single feature
   * @param projectPath - The main project path
   * @param featureId - The feature ID to execute
   * @param useWorktrees - Whether to use worktrees for isolation
   * @param isAutoMode - Whether this is running in auto mode
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: ExecuteFeatureOptions
  ): Promise<void> {
    // Lease-based concurrency: acquire() returns false if the feature is already running.
    // Callers that need idempotent behaviour (e.g. resumeInterruptedFeatures) should
    // check concurrencyManager.has() before calling executeFeature.  Throwing here
    // preserves the error contract expected by the integration test suite.
    const isNewAcquire = this.concurrencyManager.acquire(featureId, projectPath, null, null);
    if (!isNewAcquire) {
      const existing = this.concurrencyManager.get(featureId);
      const runtime = existing ? Math.floor((Date.now() - existing.startTime) / 1000) : 0;
      // Undo the lease increment so the ref count stays correct
      this.concurrencyManager.release(featureId);
      throw new Error(`Feature ${featureId} is already running (runtime: ${runtime}s)`);
    }
    try {
      return await this.executionService.executeFeature(
        projectPath,
        featureId,
        useWorktrees,
        isAutoMode,
        providedWorktreePath,
        options
      );
    } finally {
      this.concurrencyManager.release(featureId);
    }
  }

  /**
   * Stop a specific feature
   */
  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    // Cancel any pending plan approval for this feature
    this.cancelPlanApproval(featureId);

    running.abortController.abort();

    // Remove from running features immediately to allow resume
    // The abort signal will still propagate to stop any ongoing execution
    this.concurrencyManager.release(featureId);
    this.runningFeatures.delete(featureId);
    this.typedEventBus.clearFeature(featureId);
    activeAgentsCount.set(this.runningFeatures.size);

    // Cancel retry timer to prevent zombie restart loop
    const retryTimer = this.retryTimers.get(featureId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(featureId);
      logger.info(`Cancelled retry timer for stopped feature ${featureId}`);
    }

    // Also clean up from startingFeatures in case it's stuck there
    this.cleanupStartingFeature(featureId);

    return true;
  }

  /**
   * Remove a feature from all startingFeatures sets
   * Helper to prevent features from getting stuck in "starting" state
   */
  private cleanupStartingFeature(featureId: string): void {
    for (const projectState of this.coordinator.loops.values()) {
      projectState.startingFeatures.delete(featureId);
    }
  }

  /**
   * Graceful shutdown: stop all auto-loops and abort all running features.
   * Called during SIGTERM/SIGINT to prevent orphaned agent processes.
   */
  async shutdown(): Promise<void> {
    logger.info(
      `[Shutdown] Stopping ${this.coordinator.loops.size} auto-loops and ${this.runningFeatures.size} running features`
    );

    // Mark all running features as interrupted BEFORE aborting agents
    await this.markAllRunningFeaturesInterrupted('server shutdown');

    // Stop all per-project auto-loops via coordinator
    this.coordinator.shutdown();

    // Stop legacy auto-loop if running
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Cancel all pending retry timers
    for (const [featureId, timer] of this.retryTimers) {
      clearTimeout(timer);
      logger.info(`[Shutdown] Cancelled retry timer for feature: ${featureId}`);
    }
    this.retryTimers.clear();

    // Abort all running features
    for (const [featureId, running] of this.runningFeatures) {
      running.abortController.abort();
      logger.info(`[Shutdown] Aborted feature: ${featureId}`);
    }
    this.runningFeatures.clear();
  }

  /**
   * Check if a feature is currently running
   */
  isFeatureRunning(featureId: string): boolean {
    return this.runningFeatures.has(featureId);
  }

  /**
   * Mark a single running feature as interrupted.
   * Called during shutdown to persist the interrupted state before aborting agents.
   * Preserves pipeline_* statuses (pipeline resume needs the step info).
   */
  private async markFeatureInterrupted(featureId: string, reason: string): Promise<void> {
    try {
      const running = this.runningFeatures.get(featureId);
      if (!running) return;

      const feature = await this.loadFeature(running.projectPath, featureId);
      if (!feature) return;

      const previousStatus = feature.status || 'in_progress';

      // Don't overwrite pipeline_* statuses — pipeline resume needs the step info
      if (previousStatus.startsWith('pipeline_')) {
        logger.info(
          `[Shutdown] Preserving pipeline status "${previousStatus}" for feature ${featureId}`
        );
        return;
      }

      // Don't mark terminal statuses
      if (
        previousStatus === 'done' ||
        previousStatus === 'review' ||
        previousStatus === 'verified'
      ) {
        return;
      }

      await this.featureLoader.update(running.projectPath, featureId, {
        status: 'interrupted',
        statusChangeReason: `Interrupted from "${previousStatus}": ${reason}`,
      });

      this.emitAutoModeEvent('feature_interrupted', {
        featureId,
        previousStatus,
        reason,
        projectPath: running.projectPath,
      });

      logger.info(`[Shutdown] Marked feature ${featureId} as interrupted (was: ${previousStatus})`);
    } catch (error) {
      logger.warn(`[Shutdown] Failed to mark feature ${featureId} as interrupted:`, error);
    }
  }

  /**
   * Mark all currently running features as interrupted.
   * Called at the start of shutdown() before aborting agents.
   */
  private async markAllRunningFeaturesInterrupted(reason: string): Promise<void> {
    const featureIds = Array.from(this.runningFeatures.keys());
    if (featureIds.length === 0) return;

    logger.info(`[Shutdown] Marking ${featureIds.length} running feature(s) as interrupted`);
    await Promise.allSettled(featureIds.map((id) => this.markFeatureInterrupted(id, reason)));
  }

  /**
   * Reconcile feature states after server restart.
   * Finds features stuck in transient states (in_progress, interrupted, pipeline_*)
   * with no running agent and resets them to backlog.
   * Emits events for each reconciled feature and a batch summary.
   */
  async reconcileFeatureStates(
    projectPath: string
  ): Promise<{ reconciled: Array<{ featureId: string; from: string; to: string }> }> {
    const features = await this.featureLoader.getAll(projectPath);
    const reconciled: Array<{ featureId: string; from: string; to: string }> = [];

    const stuckFeatures = features.filter((f) => {
      const status = f.status || '';
      const isTransient =
        status === 'in_progress' ||
        status === 'interrupted' ||
        status === 'running' ||
        status.startsWith('pipeline_');
      return isTransient && !this.runningFeatures.has(f.id);
    });

    for (const feature of stuckFeatures) {
      const previousStatus = feature.status || 'unknown';
      try {
        await this.featureLoader.update(projectPath, feature.id, {
          status: 'backlog',
          startedAt: undefined,
        });

        // Delete checkpoint for this feature (crash recovery cleanup)
        if (this.pipelineCheckpointService) {
          try {
            await this.pipelineCheckpointService.delete(projectPath, feature.id);
            logger.debug(`[RECONCILE] Deleted checkpoint for feature ${feature.id}`);
          } catch (cpError) {
            // Checkpoint deletion should not block reconciliation
            logger.warn(`[RECONCILE] Failed to delete checkpoint for ${feature.id}:`, cpError);
          }
        }

        reconciled.push({
          featureId: feature.id,
          from: previousStatus,
          to: 'backlog',
        });

        this.emitAutoModeEvent('feature_status_changed', {
          featureId: feature.id,
          previousStatus,
          newStatus: 'backlog',
          reason: 'Reconciled after server restart',
          projectPath,
        });

        logger.info(
          `[RECONCILE] Reset feature "${feature.title || feature.id}" from "${previousStatus}" to "backlog"`,
          { projectPath, featureId: feature.id }
        );
      } catch (error) {
        logger.warn(`[RECONCILE] Failed to reset feature ${feature.id}:`, error);
      }
    }

    if (reconciled.length > 0) {
      this.emitAutoModeEvent('features_reconciled', {
        count: reconciled.length,
        features: reconciled,
        projectPath,
      });
      logger.info(`[RECONCILE] Reset ${reconciled.length} stuck feature(s) for ${projectPath}`);
    }

    return { reconciled };
  }

  /**
   * Resume a feature (continues from saved context)
   */
  async resumeFeature(projectPath: string, featureId: string, useWorktrees = false): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      const existing = this.runningFeatures.get(featureId);
      const runtime = existing ? Math.floor((Date.now() - existing.startTime) / 1000) : 0;
      logger.warn(
        `Feature ${featureId} is already running (runtime: ${runtime}s). Skipping duplicate resume.`
      );
      return; // Idempotent — skip silently instead of throwing
    }

    // Load feature to check status
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Guard: refuse to resume features in terminal states.
    // Only guard against truly terminal states (done/verified) — review features
    // may legitimately need re-execution when PR feedback arrives.
    const TERMINAL_STATUSES = new Set(['done', 'verified']);
    if (TERMINAL_STATUSES.has(feature.status ?? '')) {
      logger.warn(
        `Refusing to resume feature ${featureId} — already in terminal status "${feature.status}".`
      );
      return;
    }

    // Check if feature is stuck in a pipeline step
    const pipelineInfo = await this.detectPipelineStatus(
      projectPath,
      featureId,
      (feature.status || '') as FeatureStatusWithPipeline
    );

    if (pipelineInfo.isPipeline) {
      // Feature stuck in pipeline - use pipeline resume
      return this.resumePipelineFeature(projectPath, feature, useWorktrees, pipelineInfo);
    }

    // Normal resume flow for non-pipeline features
    // Check if context exists in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    let hasContext = false;
    try {
      await secureFs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    if (hasContext) {
      // Load previous context and continue
      const context = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      return this.executeFeatureWithContext(projectPath, featureId, context, useWorktrees);
    }

    // No context, start fresh - executeFeature will handle adding to runningFeatures
    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Resume a feature that crashed during pipeline execution.
   * Handles multiple edge cases to ensure robust recovery:
   * - No context file: Restart entire pipeline from beginning
   * - Step deleted from config: Complete feature without remaining pipeline steps
   * - Valid step exists: Resume from the crashed step and continue
   *
   * @param {string} projectPath - Absolute path to the project directory
   * @param {Feature} feature - The feature object (already loaded to avoid redundant reads)
   * @param {boolean} useWorktrees - Whether to use git worktrees for isolation
   * @param {PipelineStatusInfo} pipelineInfo - Information about the pipeline status from detectPipelineStatus()
   * @returns {Promise<void>} Resolves when resume operation completes or throws on error
   * @throws {Error} If pipeline config is null but stepIndex is valid (should never happen)
   * @private
   */
  private async resumePipelineFeature(
    projectPath: string,
    feature: Feature,
    useWorktrees: boolean,
    pipelineInfo: PipelineStatusInfo
  ): Promise<void> {
    const featureId = feature.id;
    logger.info(`Resuming feature ${featureId} from pipeline step ${pipelineInfo.stepId}`);

    // Check for context file
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    let hasContext = false;
    try {
      await secureFs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    // Edge Case 1: No context file - restart entire pipeline from beginning
    if (!hasContext) {
      logger.warn(`No context found for pipeline feature ${featureId}, restarting from beginning`);

      // Reset status to in_progress and start fresh
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      return this.executeFeature(projectPath, featureId, useWorktrees, false);
    }

    // Edge Case 2: Step no longer exists in pipeline config
    if (pipelineInfo.stepIndex === -1) {
      logger.warn(
        `Step ${pipelineInfo.stepId} no longer exists in pipeline, completing feature without pipeline`
      );

      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';

      // Derive worktree path for the guard check
      const branchName = feature.branchName;
      const worktreePath = branchName
        ? await this.findExistingWorktreeForBranch(projectPath, branchName)
        : null;
      const pipelineWorkDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

      // Ensure worktree is clean before marking as verified
      await ensureCleanWorktree(pipelineWorkDir, featureId, branchName ?? 'main');

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Run git workflow (commit, push, PR) if enabled
      let gitWorkflowResult: Awaited<
        ReturnType<typeof gitWorkflowService.runPostCompletionWorkflow>
      > = null;
      if (this.settingsService) {
        try {
          const settings = await this.settingsService.getGlobalSettings();

          // Look up epic branch name if feature belongs to an epic
          let epicBranchName: string | undefined;
          if (feature.epicId && !feature.isEpic) {
            const epicFeature = await this.featureLoader.get(projectPath, feature.epicId);
            epicBranchName = epicFeature?.branchName;
            if (epicBranchName) {
              logger.info(`Feature ${featureId} belongs to epic, PR will target ${epicBranchName}`);
            }
          }

          gitWorkflowResult = await gitWorkflowService.runPostCompletionWorkflow(
            projectPath,
            featureId,
            feature,
            pipelineWorkDir,
            settings,
            epicBranchName,
            this.events
          );
          if (gitWorkflowResult) {
            // Check if git workflow encountered conflicts
            if (gitWorkflowResult.error && gitWorkflowResult.error.includes('conflict')) {
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId,
                featureName: feature.title,
                message: `⚠️ Git workflow warning: ${gitWorkflowResult.error}`,
                projectPath,
              });
            }

            this.emitAutoModeEvent('auto_mode_git_workflow', {
              featureId,
              committed: gitWorkflowResult.commitHash,
              pushed: gitWorkflowResult.pushed,
              prUrl: gitWorkflowResult.prUrl,
              prNumber: gitWorkflowResult.prNumber,
              error: gitWorkflowResult.error,
              projectPath,
            });
          }
        } catch (error) {
          logger.error('Error running post-completion git workflow:', error);
          this.emitAutoModeEvent('auto_mode_progress', {
            featureId,
            featureName: feature.title,
            message: `⚠️ Git workflow failed: ${error instanceof Error ? error.message : String(error)}`,
            projectPath,
          });
          // Store the error on the feature for UI visibility (non-blocking)
          this.featureLoader
            .update(projectPath, featureId, {
              gitWorkflowError: {
                message: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString(),
              },
            })
            .catch((e) => logger.warn(`Failed to persist git workflow error for ${featureId}:`, e));
        }
      }

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message:
          'Pipeline step no longer exists - feature completed without remaining pipeline steps',
        projectPath,
      });

      return;
    }

    // Normal case: Valid pipeline step exists, has context
    // Resume from the stuck step (re-execute the step that crashed)
    if (!pipelineInfo.config) {
      throw new Error('Pipeline config is null but stepIndex is valid - this should not happen');
    }

    return this.resumeFromPipelineStep(
      projectPath,
      feature,
      useWorktrees,
      pipelineInfo.stepIndex,
      pipelineInfo.config
    );
  }

  /**
   * Resume pipeline execution from a specific step index.
   * Re-executes the step that crashed (to handle partial completion),
   * then continues executing all remaining pipeline steps in order.
   *
   * This method handles the complete pipeline resume workflow:
   * - Validates feature and step index
   * - Locates or creates git worktree if needed
   * - Executes remaining steps starting from the crashed step
   * - Updates feature status to verified/waiting_approval when complete
   * - Emits progress events throughout execution
   *
   * @param {string} projectPath - Absolute path to the project directory
   * @param {Feature} feature - The feature object (already loaded to avoid redundant reads)
   * @param {boolean} useWorktrees - Whether to use git worktrees for isolation
   * @param {number} startFromStepIndex - Zero-based index of the step to resume from
   * @param {PipelineConfig} pipelineConfig - Pipeline config passed from detectPipelineStatus to avoid re-reading
   * @returns {Promise<void>} Resolves when pipeline execution completes successfully
   * @throws {Error} If feature not found, step index invalid, or pipeline execution fails
   * @private
   */
  private async resumeFromPipelineStep(
    projectPath: string,
    feature: Feature,
    useWorktrees: boolean,
    startFromStepIndex: number,
    pipelineConfig: PipelineConfig
  ): Promise<void> {
    const featureId = feature.id;

    const sortedSteps = [...pipelineConfig.steps].sort((a, b) => a.order - b.order);

    // Validate step index
    if (startFromStepIndex < 0 || startFromStepIndex >= sortedSteps.length) {
      throw new Error(`Invalid step index: ${startFromStepIndex}`);
    }

    // Get steps to execute (from startFromStepIndex onwards)
    const stepsToExecute = sortedSteps.slice(startFromStepIndex);

    logger.info(
      `Resuming pipeline for feature ${featureId} from step ${startFromStepIndex + 1}/${sortedSteps.length}`
    );

    // Add to running features immediately
    const abortController = new AbortController();
    const pipelineRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null, // Will be set below
      branchName: feature.branchName ?? null,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
      retryCount: 0,
      previousErrors: [],
    };
    this.concurrencyManager.acquire(featureId, projectPath, null, feature.branchName ?? null);
    this.runningFeatures.set(featureId, pipelineRunningFeature);
    activeAgentsCount.set(this.runningFeatures.size);

    try {
      // Validate project path
      validateWorkingDirectory(projectPath);

      // Derive workDir from feature.branchName
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);
        if (worktreePath) {
          logger.debug(`Using existing worktree for branch "${branchName}": ${worktreePath}`);
        } else {
          // Auto-create worktree if it doesn't exist
          logger.info(`Auto-creating worktree for branch "${branchName}"`);
          worktreePath = await this.createWorktreeForBranch(projectPath, branchName, feature);
          if (worktreePath) {
            logger.info(`Created worktree for branch "${branchName}": ${worktreePath}`);
          } else {
            logger.warn(`Failed to create worktree for branch "${branchName}", using project path`);
          }
        }
      }

      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

      // CRITICAL: Rebase worktree onto latest origin/main before pipeline execution
      if (worktreePath) {
        try {
          logger.info(`Rebasing worktree onto latest origin/main: ${worktreePath}`);
          const rebaseResult = await rebaseWorktreeOnMain(worktreePath);

          if (!rebaseResult.success) {
            if (rebaseResult.hasConflicts) {
              logger.warn(
                `⚠️  Worktree has merge conflicts with main. Agent will execute on stale base. ` +
                  `Feature: ${featureId}, Branch: ${branchName}`
              );
            } else {
              logger.warn(
                `Rebase failed (${rebaseResult.error}). Agent will execute on current base. ` +
                  `Feature: ${featureId}`
              );
            }
          } else {
            logger.info(`✓ Worktree successfully rebased onto latest origin/main`);
          }
        } catch (rebaseError) {
          logger.error(
            `Unexpected error during pre-execution rebase for ${featureId}:`,
            rebaseError
          );
        }
      }

      validateWorkingDirectory(workDir);

      // Get model and provider for this feature
      const modelResult = await this.getModelForFeature(feature, projectPath);
      const provider = ProviderFactory.getProviderNameForModel(modelResult.model);

      // Update running feature with worktree info and model
      const runningFeature = this.runningFeatures.get(featureId);
      if (runningFeature) {
        runningFeature.worktreePath = worktreePath;
        runningFeature.branchName = branchName ?? null;
        runningFeature.model = modelResult.model;
        runningFeature.provider = provider;
      }

      // Emit resume event
      this.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        branchName: branchName ?? null,
        feature: {
          id: featureId,
          title: feature.title || 'Resuming Pipeline',
          description: feature.description,
        },
        model: modelResult.model,
        provider,
      });

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        projectPath,
        branchName: branchName ?? null,
        content: `Resuming from pipeline step ${startFromStepIndex + 1}/${sortedSteps.length}`,
      });

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Execute remaining pipeline steps (starting from crashed step)
      await this.executionService.executePipelineSteps(
        projectPath,
        featureId,
        feature,
        stepsToExecute,
        workDir,
        abortController,
        autoLoadClaudeMd
      );

      // Determine final status
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';

      // Ensure worktree is clean before marking as verified
      await ensureCleanWorktree(workDir, featureId, branchName ?? 'main');

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      logger.info('Pipeline resume completed successfully');

      // Run git workflow (commit, push, PR) if enabled
      let gitWorkflowResult: Awaited<
        ReturnType<typeof gitWorkflowService.runPostCompletionWorkflow>
      > = null;
      if (this.settingsService) {
        try {
          const settings = await this.settingsService.getGlobalSettings();

          // Look up epic branch name if feature belongs to an epic
          let epicBranchName: string | undefined;
          if (feature.epicId && !feature.isEpic) {
            const epicFeature = await this.featureLoader.get(projectPath, feature.epicId);
            epicBranchName = epicFeature?.branchName;
            if (epicBranchName) {
              logger.info(`Feature ${featureId} belongs to epic, PR will target ${epicBranchName}`);
            }
          }

          gitWorkflowResult = await gitWorkflowService.runPostCompletionWorkflow(
            projectPath,
            featureId,
            feature,
            workDir,
            settings,
            epicBranchName,
            this.events
          );
          if (gitWorkflowResult) {
            // Check if git workflow encountered conflicts
            if (gitWorkflowResult.error && gitWorkflowResult.error.includes('conflict')) {
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId,
                featureName: feature.title,
                message: `⚠️ Git workflow warning: ${gitWorkflowResult.error}`,
                projectPath,
              });
            }

            this.emitAutoModeEvent('auto_mode_git_workflow', {
              featureId,
              committed: gitWorkflowResult.commitHash,
              pushed: gitWorkflowResult.pushed,
              prUrl: gitWorkflowResult.prUrl,
              prNumber: gitWorkflowResult.prNumber,
              prAlreadyExisted: gitWorkflowResult.prAlreadyExisted,
              projectPath,
            });
          }
        } catch (gitError) {
          logger.warn(`Git workflow failed for ${featureId}:`, gitError);
          // Store the error on the feature for UI visibility (non-blocking)
          this.featureLoader
            .update(projectPath, featureId, {
              gitWorkflowError: {
                message: gitError instanceof Error ? gitError.message : String(gitError),
                timestamp: new Date().toISOString(),
              },
            })
            .catch((e) => logger.warn(`Failed to persist git workflow error for ${featureId}:`, e));
        }
      }

      // Transition feature to 'review' or 'done' based on git workflow results
      // (mirrors the pattern in executeFeature)
      if (gitWorkflowResult?.prUrl) {
        const updates: Record<string, unknown> = {
          prUrl: gitWorkflowResult.prUrl,
          prNumber: gitWorkflowResult.prNumber,
        };

        if (gitWorkflowResult.prCreatedAt) {
          updates.prCreatedAt = gitWorkflowResult.prCreatedAt;
        }

        if (gitWorkflowResult.merged && gitWorkflowResult.prMergedAt) {
          updates.status = 'done';
          updates.prMergedAt = gitWorkflowResult.prMergedAt;

          if (gitWorkflowResult.prCreatedAt) {
            const createdAt = new Date(gitWorkflowResult.prCreatedAt);
            const mergedAt = new Date(gitWorkflowResult.prMergedAt);
            updates.prReviewDurationMs = mergedAt.getTime() - createdAt.getTime();
          }
        } else {
          updates.status = 'review';
        }

        await this.featureLoader.update(projectPath, featureId, updates);
      }

      const gitInfo = gitWorkflowResult?.commitHash
        ? ` | Committed: ${gitWorkflowResult.commitHash}${gitWorkflowResult.pushed ? ', pushed' : ''}${gitWorkflowResult.prUrl ? `, PR: ${gitWorkflowResult.prUrl}` : ''}`
        : '';

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message: `Pipeline resumed and completed successfully${gitInfo}`,
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature.title,
          branchName: feature.branchName ?? null,
          passes: false,
          message: 'Pipeline resume stopped by user',
          projectPath,
        });
      } else {
        logger.error(`Pipeline resume failed for feature ${featureId}:`, error);
        await this.updateFeatureStatus(projectPath, featureId, 'backlog');
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          featureName: feature.title,
          branchName: feature.branchName ?? null,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });
      }
    } finally {
      abortController.abort();

      // Only delete if the current entry is still the one we created
      const current = this.runningFeatures.get(featureId);
      if (current === pipelineRunningFeature) {
        this.concurrencyManager.release(featureId);
        this.runningFeatures.delete(featureId);
        this.typedEventBus.clearFeature(featureId);
        activeAgentsCount.set(this.runningFeatures.size);
      }
    }
  }

  /**
   * Follow up on a feature with additional instructions
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees = true
  ): Promise<void> {
    // Validate project path early for fast failure
    validateWorkingDirectory(projectPath);

    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();

    // Load feature info for context FIRST to get branchName
    const feature = await this.loadFeature(projectPath, featureId);

    // Derive workDir from feature.branchName
    // If no branchName, derive from feature ID: feature/{featureId}
    let workDir = path.resolve(projectPath);
    let worktreePath: string | null = null;
    const branchName = feature?.branchName || `feature/${featureId}`;

    if (useWorktrees && branchName) {
      // Try to find existing worktree for this branch
      worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);

      if (worktreePath) {
        workDir = worktreePath;
        logger.info(`Follow-up using existing worktree for branch "${branchName}": ${workDir}`);
      } else {
        // Auto-create worktree if it doesn't exist
        logger.info(`Follow-up auto-creating worktree for branch "${branchName}"`);
        worktreePath = await this.createWorktreeForBranch(
          projectPath,
          branchName,
          feature ?? undefined
        );
        if (worktreePath) {
          workDir = worktreePath;
          logger.info(`Follow-up created worktree for branch "${branchName}": ${workDir}`);
        } else {
          logger.warn(
            `Follow-up failed to create worktree for branch "${branchName}", using project path`
          );
        }
      }
    }

    // CRITICAL: Rebase worktree onto latest origin/main before follow-up execution
    if (worktreePath) {
      try {
        logger.info(`Rebasing worktree onto latest origin/main: ${worktreePath}`);
        const rebaseResult = await rebaseWorktreeOnMain(worktreePath);

        if (!rebaseResult.success) {
          if (rebaseResult.hasConflicts) {
            logger.warn(
              `⚠️  Worktree has merge conflicts with main. Follow-up will execute on stale base. ` +
                `Feature: ${featureId}, Branch: ${branchName}`
            );
          } else {
            logger.warn(
              `Rebase failed (${rebaseResult.error}). Follow-up will execute on current base. ` +
                `Feature: ${featureId}`
            );
          }
        } else {
          logger.info(`✓ Worktree successfully rebased onto latest origin/main`);
        }
      } catch (rebaseError) {
        logger.error(`Unexpected error during pre-execution rebase for ${featureId}:`, rebaseError);
      }
    }

    // Load previous agent output if it exists
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    // Load autoLoadClaudeMd setting to determine context loading strategy
    const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
      projectPath,
      this.settingsService,
      '[AutoMode]'
    );

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) - passed as system prompt
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      taskContext: {
        title: feature?.title ?? prompt.substring(0, 200),
        description: feature?.description ?? prompt,
      },
    });

    // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
    // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? this.buildFeaturePrompt(feature, prompts.taskExecution) : `**Feature ID:** ${featureId}`}
`;

    if (previousContext) {
      fullPrompt += `
## Previous Agent Work
The following is the output from the previous implementation attempt:

${previousContext}
`;
    }

    fullPrompt += `
## Follow-up Instructions
${prompt}

## Task
Address the follow-up instructions above. Review the previous work and make the requested changes or fixes.`;

    // Get model based on feature complexity and failure count
    const modelResult = feature
      ? await this.getModelForFeature(feature, projectPath)
      : { model: DEFAULT_MODELS.autoMode };
    const provider = ProviderFactory.getProviderNameForModel(modelResult.model);
    logger.info(
      `Follow-up for feature ${featureId} using model: ${modelResult.model}, provider: ${provider}`
    );

    const followUpRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
      model: modelResult.model,
      provider,
      retryCount: 0,
      previousErrors: [],
    };
    this.concurrencyManager.acquire(featureId, projectPath, worktreePath, branchName);
    this.runningFeatures.set(featureId, followUpRunningFeature);
    activeAgentsCount.set(this.runningFeatures.size);

    try {
      // Update feature status to in_progress BEFORE emitting event
      // This ensures the frontend sees the updated status when it reloads features
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Emit feature start event AFTER status update so frontend sees correct status
      this.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        branchName,
        feature: feature || {
          id: featureId,
          title: 'Follow-up',
          description: prompt.substring(0, 100),
        },
        model: modelResult.model,
        provider,
      });

      // Copy follow-up images to feature folder
      const copiedImagePaths: string[] = [];
      if (imagePaths && imagePaths.length > 0) {
        const featureDirForImages = getFeatureDir(projectPath, featureId);
        const featureImagesDir = path.join(featureDirForImages, 'images');

        await secureFs.mkdir(featureImagesDir, { recursive: true });

        for (const imagePath of imagePaths) {
          try {
            // Get the filename from the path
            const filename = path.basename(imagePath);
            const destPath = path.join(featureImagesDir, filename);

            // Copy the image
            await secureFs.copyFile(imagePath, destPath);

            // Store the absolute path (external storage uses absolute paths)
            copiedImagePaths.push(destPath);
          } catch (error) {
            logger.error(`Failed to copy follow-up image ${imagePath}:`, error);
          }
        }
      }

      // Update feature object with new follow-up images BEFORE building prompt
      if (copiedImagePaths.length > 0 && feature) {
        const currentImagePaths = feature.imagePaths || [];
        const newImagePaths = copiedImagePaths.map((p) => ({
          path: p,
          filename: path.basename(p),
          mimeType: 'image/png', // Default, could be improved
        }));

        feature.imagePaths = [...currentImagePaths, ...newImagePaths];
      }

      // Combine original feature images with new follow-up images
      const allImagePaths: string[] = [];

      // Add all images from feature (now includes both original and new)
      if (feature?.imagePaths) {
        const allPaths = feature.imagePaths.map((img) =>
          typeof img === 'string' ? img : img.path
        );
        allImagePaths.push(...allPaths);
      }

      // Save updated feature.json with new images (atomic write with backup)
      if (copiedImagePaths.length > 0 && feature) {
        const featureDirForSave = getFeatureDir(projectPath, featureId);
        const featurePath = path.join(featureDirForSave, 'feature.json');

        try {
          await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });
        } catch (error) {
          logger.error(`Failed to save feature.json:`, error);
        }
      }

      // Use fullPrompt (already built above) with model and all images
      // Note: Follow-ups skip planning mode - they continue from previous work
      // Pass previousContext so the history is preserved in the output file
      // Context files are passed as system prompt for higher priority
      await this.executionService.runAgent(
        workDir,
        featureId,
        fullPrompt,
        abortController,
        projectPath,
        allImagePaths.length > 0 ? allImagePaths : imagePaths,
        modelResult.model,
        {
          projectPath,
          planningMode: 'skip', // Follow-ups don't require approval
          previousContent: previousContext || undefined,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature?.thinkingLevel,
          providerId: modelResult.providerId,
        }
      );

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): go directly to 'verified' (no manual verify needed)
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      const finalStatus = feature?.skipTests ? 'waiting_approval' : 'verified';

      // Ensure worktree is clean before marking as verified
      await ensureCleanWorktree(workDir, featureId, branchName ?? 'main');

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.recordSuccessForProject(projectPath, branchName ?? null);

      // Run git workflow (commit, push, PR) if enabled
      let gitWorkflowResult: Awaited<
        ReturnType<typeof gitWorkflowService.runPostCompletionWorkflow>
      > = null;
      if (feature && this.settingsService) {
        try {
          const settings = await this.settingsService.getGlobalSettings();

          // Look up epic branch name if feature belongs to an epic
          let epicBranchName: string | undefined;
          if (feature.epicId && !feature.isEpic) {
            const epicFeature = await this.featureLoader.get(projectPath, feature.epicId);
            epicBranchName = epicFeature?.branchName;
            if (epicBranchName) {
              logger.info(`Feature ${featureId} belongs to epic, PR will target ${epicBranchName}`);
            }
          }

          gitWorkflowResult = await gitWorkflowService.runPostCompletionWorkflow(
            projectPath,
            featureId,
            feature,
            workDir,
            settings,
            epicBranchName,
            this.events
          );
          if (gitWorkflowResult) {
            // Check if git workflow encountered conflicts
            if (gitWorkflowResult.error && gitWorkflowResult.error.includes('conflict')) {
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId,
                featureName: feature.title,
                message: `⚠️ Git workflow warning: ${gitWorkflowResult.error}`,
                projectPath,
              });
            }

            this.emitAutoModeEvent('auto_mode_git_workflow', {
              featureId,
              committed: gitWorkflowResult.commitHash,
              pushed: gitWorkflowResult.pushed,
              prUrl: gitWorkflowResult.prUrl,
              prNumber: gitWorkflowResult.prNumber,
              prAlreadyExisted: gitWorkflowResult.prAlreadyExisted,
              projectPath,
            });

            // Transition feature to 'review' or 'done' based on merge status
            if (gitWorkflowResult.prUrl) {
              const updates: Record<string, unknown> = {
                prUrl: gitWorkflowResult.prUrl,
                prNumber: gitWorkflowResult.prNumber,
              };

              // Set PR creation timestamp
              if (gitWorkflowResult.prCreatedAt) {
                updates.prCreatedAt = gitWorkflowResult.prCreatedAt;
              }

              // If PR was auto-merged, set merge timestamp and status to 'done'
              if (gitWorkflowResult.merged && gitWorkflowResult.prMergedAt) {
                updates.status = 'done';
                updates.prMergedAt = gitWorkflowResult.prMergedAt;

                // Calculate review duration if prCreatedAt is available
                if (gitWorkflowResult.prCreatedAt) {
                  const createdAt = new Date(gitWorkflowResult.prCreatedAt);
                  const mergedAt = new Date(gitWorkflowResult.prMergedAt);
                  updates.prReviewDurationMs = mergedAt.getTime() - createdAt.getTime();
                }
              } else {
                // PR created but not merged - transition to 'review'
                updates.status = 'review';
              }

              await this.featureLoader.update(projectPath, featureId, updates);
            }
          }
        } catch (gitError) {
          logger.warn(`Git workflow failed for ${featureId}:`, gitError);
          // Store the error on the feature for UI visibility (non-blocking)
          this.featureLoader
            .update(projectPath, featureId, {
              gitWorkflowError: {
                message: gitError instanceof Error ? gitError.message : String(gitError),
                timestamp: new Date().toISOString(),
              },
            })
            .catch((e) => logger.warn(`Failed to persist git workflow error for ${featureId}:`, e));
        }
      }

      const gitInfo = gitWorkflowResult?.commitHash
        ? ` | Committed: ${gitWorkflowResult.commitHash}${gitWorkflowResult.pushed ? ', pushed' : ''}${gitWorkflowResult.prUrl ? `, PR: ${gitWorkflowResult.prUrl}` : ''}`
        : '';

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature?.title,
        branchName: branchName ?? null,
        passes: true,
        message: `Follow-up completed successfully${finalStatus === 'verified' ? ' - auto-verified' : ''}${gitInfo}`,
        projectPath,
        model: modelResult.model,
        provider,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      if (!errorInfo.isCancellation) {
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          featureName: feature?.title,
          branchName: branchName ?? null,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
        });

        // Track this failure and check if we should pause auto mode
        const shouldPause = this.trackFailureAndCheckPauseForProject(
          projectPath,
          branchName ?? null,
          {
            type: errorInfo.type,
            message: errorInfo.message,
          }
        );

        if (shouldPause) {
          this.signalShouldPauseForProject(projectPath, branchName ?? null, {
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      abortController.abort();

      // Only delete if the current entry is still the one we created
      const current = this.runningFeatures.get(featureId);
      if (current === followUpRunningFeature) {
        this.concurrencyManager.release(featureId);
        this.runningFeatures.delete(featureId);
        this.typedEventBus.clearFeature(featureId);
        activeAgentsCount.set(this.runningFeatures.size);
      }
    }
  }

  /**
   * Verify a feature's implementation
   */
  async verifyFeature(projectPath: string, featureId: string): Promise<boolean> {
    // Load feature to get the name for event reporting
    const feature = await this.loadFeature(projectPath, featureId);

    // Worktrees are in project dir
    // Sanitize featureId the same way it's sanitized when creating worktrees
    const sanitizedFeatureId = featureId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const worktreePath = path.join(projectPath, '.worktrees', sanitizedFeatureId);
    let workDir = projectPath;

    try {
      await secureFs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    // Run verification - check if tests pass, build works, etc.
    const verificationChecks = [
      { cmd: 'npm run lint', name: 'Lint' },
      { cmd: 'npm run typecheck', name: 'Type check' },
      { cmd: 'npm test', name: 'Tests' },
      { cmd: 'npm run build', name: 'Build' },
    ];

    let allPassed = true;
    const results: Array<{ check: string; passed: boolean; output?: string }> = [];

    for (const check of verificationChecks) {
      try {
        const { stdout, stderr } = await execAsync(check.cmd, {
          cwd: workDir,
          timeout: 120000,
        });
        results.push({
          check: check.name,
          passed: true,
          output: stdout || stderr,
        });
      } catch (error) {
        allPassed = false;
        results.push({
          check: check.name,
          passed: false,
          output: (error as Error).message,
        });
        break; // Stop on first failure
      }
    }

    this.emitAutoModeEvent('auto_mode_feature_complete', {
      featureId,
      featureName: feature?.title,
      branchName: feature?.branchName ?? null,
      passes: allPassed,
      message: allPassed
        ? 'All verification checks passed'
        : `Verification failed: ${results.find((r) => !r.passed)?.check || 'Unknown'}`,
      projectPath,
    });

    return allPassed;
  }

  /**
   * Commit feature changes
   * @param projectPath - The main project path
   * @param featureId - The feature ID to commit
   * @param providedWorktreePath - Optional: the worktree path where the feature's changes are located
   */
  async commitFeature(
    projectPath: string,
    featureId: string,
    providedWorktreePath?: string
  ): Promise<string | null> {
    let workDir = projectPath;

    // Use the provided worktree path if given
    if (providedWorktreePath) {
      try {
        await secureFs.access(providedWorktreePath);
        workDir = providedWorktreePath;
        logger.info(`Committing in provided worktree: ${workDir}`);
      } catch {
        logger.info(
          `Provided worktree path doesn't exist: ${providedWorktreePath}, using project path`
        );
      }
    } else {
      // Fallback: try to find worktree at legacy location
      // Sanitize featureId the same way it's sanitized when creating worktrees
      const sanitizedFeatureId = featureId.replace(/[^a-zA-Z0-9_-]/g, '-');
      const legacyWorktreePath = path.join(projectPath, '.worktrees', sanitizedFeatureId);
      try {
        await secureFs.access(legacyWorktreePath);
        workDir = legacyWorktreePath;
        logger.info(`Committing in legacy worktree: ${workDir}`);
      } catch {
        logger.info(`No worktree found, committing in project path: ${workDir}`);
      }
    }

    try {
      // Check for changes
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: workDir,
      });
      if (!status.trim()) {
        return null; // No changes
      }

      // Load feature for commit message
      const feature = await this.loadFeature(projectPath, featureId);
      const commitMessage = feature
        ? `feat: ${this.extractTitleFromDescription(
            feature.description
          )}\n\nImplemented by Automaker auto-mode`
        : `feat: Feature ${featureId}`;

      // Stage and commit
      await execAsync("git add -A -- ':!.automaker/'", { cwd: workDir });
      await execFileAsync('git', ['commit', '-m', commitMessage], {
        cwd: workDir,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync('git rev-parse HEAD', {
        cwd: workDir,
      });

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature?.title,
        branchName: feature?.branchName ?? null,
        passes: true,
        message: `Changes committed: ${hash.trim().substring(0, 8)}`,
        projectPath,
      });

      return hash.trim();
    } catch (error) {
      logger.error(`Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Check if context exists for a feature.
   *
   * Guards against the stale context trap: if agent-output.md exists but
   * hasn't been written to in over 2 hours, the session that created it is
   * gone. Rename it to .stale so the next run starts fresh instead of trying
   * to resume a dead Claude session (which handshakes, fails silently, and
   * exits immediately).
   */
  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    try {
      await secureFs.access(contextPath);

      const stats = await secureFs.stat(contextPath);
      const ageMs = Date.now() - stats.mtime.getTime();
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

      if (ageMs > TWO_HOURS_MS) {
        logger.warn(
          `[contextExists] agent-output.md for ${featureId} is ${Math.round(ageMs / 60000)}m old — stale session, renaming to .stale`
        );
        await secureFs.rename(contextPath, `${contextPath}.stale`);
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze project to gather context
   */
  async analyzeProject(projectPath: string): Promise<void> {
    const abortController = new AbortController();

    const analysisFeatureId = `analysis-${Date.now()}`;
    this.emitAutoModeEvent('auto_mode_feature_start', {
      featureId: analysisFeatureId,
      projectPath,
      branchName: null, // Project analysis is not worktree-specific
      feature: {
        id: analysisFeatureId,
        title: 'Project Analysis',
        description: 'Analyzing project structure',
      },
    });

    const prompt = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

    try {
      // Get model from phase settings with provider info
      const {
        phaseModel: phaseModelEntry,
        provider: analysisClaudeProvider,
        credentials,
      } = await getPhaseModelWithOverrides(
        'projectAnalysisModel',
        this.settingsService,
        projectPath,
        '[AutoMode]'
      );
      const { model: analysisModel, thinkingLevel: analysisThinkingLevel } =
        resolvePhaseModel(phaseModelEntry);
      logger.info(
        'Using model for project analysis:',
        analysisModel,
        analysisClaudeProvider ? `via provider: ${analysisClaudeProvider.name}` : 'direct API'
      );

      const provider = ProviderFactory.getProviderForModel(analysisModel);

      // Load autoLoadClaudeMd setting
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Use createCustomOptions for centralized SDK configuration with CLAUDE.md support
      const sdkOptions = createCustomOptions({
        cwd: projectPath,
        model: analysisModel,
        maxTurns: 5,
        allowedTools: ['Read', 'Glob', 'Grep'],
        abortController,
        autoLoadClaudeMd,
        thinkingLevel: analysisThinkingLevel,
      });

      const options: ExecuteOptions = {
        prompt,
        model: sdkOptions.model ?? analysisModel,
        cwd: sdkOptions.cwd ?? projectPath,
        maxTurns: sdkOptions.maxTurns,
        allowedTools: sdkOptions.allowedTools as string[],
        abortController,
        settingSources: sdkOptions.settingSources,
        thinkingLevel: analysisThinkingLevel, // Pass thinking level
        credentials, // Pass credentials for resolving 'credentials' apiKeySource
        claudeCompatibleProvider: analysisClaudeProvider, // Pass provider for alternative endpoint configuration
      };

      const stream = provider.executeQuery(options);
      let analysisResult = '';

      for await (const msg of stream) {
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              analysisResult = block.text || '';
              this.emitAutoModeEvent('auto_mode_progress', {
                featureId: analysisFeatureId,
                content: block.text,
                projectPath,
              });
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          analysisResult = msg.result || analysisResult;
        }
      }

      // Save analysis to .automaker directory
      const automakerDir = getAutomakerDir(projectPath);
      const analysisPath = path.join(automakerDir, 'project-analysis.md');
      await secureFs.mkdir(automakerDir, { recursive: true });
      await secureFs.writeFile(analysisPath, analysisResult);

      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId: analysisFeatureId,
        featureName: 'Project Analysis',
        branchName: null, // Project analysis is not worktree-specific
        passes: true,
        message: 'Project analysis completed',
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);
      this.emitAutoModeEvent('auto_mode_error', {
        featureId: analysisFeatureId,
        featureName: 'Project Analysis',
        branchName: null, // Project analysis is not worktree-specific
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath,
      });
    } finally {
      abortController.abort();
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
  } {
    return {
      isRunning: this.runningFeatures.size > 0,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Get status for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  getStatusForProject(
    projectPath: string,
    branchName: string | null = null
  ): {
    isAutoLoopRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
    maxConcurrency: number;
    branchName: string | null;
    humanBlockedCount: number;
  } {
    const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
    const projectState = this.coordinator.getState(worktreeKey);
    const runningFeatures: string[] = [];

    for (const [featureId, feature] of this.runningFeatures) {
      if (feature.projectPath !== projectPath) continue;

      if (branchName === null) {
        // Main worktree: include ALL project features (they migrate to their own branches
        // once worktrees are created, so exact branch matching would miss them)
        runningFeatures.push(featureId);
      } else {
        // Feature worktree: exact match
        if (feature.branchName === branchName) {
          runningFeatures.push(featureId);
        }
      }
    }

    return {
      isAutoLoopRunning: projectState?.isRunning ?? false,
      runningFeatures,
      runningCount: runningFeatures.length,
      maxConcurrency: projectState?.config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      branchName,
      humanBlockedCount: projectState?.humanBlockedCount ?? 0,
    };
  }

  /**
   * Get all active auto loop worktrees with their project paths and branch names
   */
  getActiveAutoLoopWorktrees(): Array<{ projectPath: string; branchName: string | null }> {
    const activeWorktrees: Array<{ projectPath: string; branchName: string | null }> = [];
    for (const [, state] of this.coordinator.loops) {
      if (state.isRunning) {
        activeWorktrees.push({
          projectPath: state.config.projectPath,
          branchName: state.branchName,
        });
      }
    }
    return activeWorktrees;
  }

  /**
   * Get all projects that have auto mode running (legacy, returns unique project paths)
   * @deprecated Use getActiveAutoLoopWorktrees instead for full worktree information
   */
  getActiveAutoLoopProjects(): string[] {
    const activeProjects = new Set<string>();
    for (const [, state] of this.coordinator.loops) {
      if (state.isRunning) {
        activeProjects.add(state.config.projectPath);
      }
    }
    return Array.from(activeProjects);
  }

  /**
   * Get detailed info about all running agents
   */
  async getRunningAgents(): Promise<
    Array<{
      featureId: string;
      projectPath: string;
      projectName: string;
      isAutoMode: boolean;
      startTime: number;
      model?: string;
      provider?: ModelProvider;
      title?: string;
      description?: string;
      branchName?: string;
      costUsd?: number;
    }>
  > {
    const agents = await Promise.all(
      Array.from(this.runningFeatures.values()).map(async (rf) => {
        // Try to fetch feature data to get title, description, and branchName
        let title: string | undefined;
        let description: string | undefined;
        let branchName: string | undefined;
        let costUsd: number | undefined;

        try {
          const feature = await this.featureLoader.get(rf.projectPath, rf.featureId);
          if (feature) {
            title = feature.title;
            description = feature.description;
            branchName = feature.branchName;
            costUsd = feature.costUsd as number | undefined;
          }
        } catch (_error) {
          // Silently ignore errors - title/description/branchName are optional
        }

        return {
          featureId: rf.featureId,
          projectPath: rf.projectPath,
          projectName: path.basename(rf.projectPath),
          isAutoMode: rf.isAutoMode,
          startTime: rf.startTime,
          model: rf.model,
          provider: rf.provider,
          title,
          description,
          branchName,
          costUsd,
        };
      })
    );
    return agents;
  }

  /**
   * Wait for plan approval from the user.
   * Returns a promise that resolves when the user approves/rejects the plan.
   * Times out after 30 minutes to prevent indefinite memory retention.
   */
  waitForPlanApproval(
    featureId: string,
    projectPath: string
  ): Promise<{ approved: boolean; editedPlan?: string; feedback?: string }> {
    const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    logger.info(`Registering pending approval for feature ${featureId}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    return new Promise((resolve, reject) => {
      // Set up timeout to prevent indefinite waiting and memory leaks
      const timeoutId = setTimeout(() => {
        const pending = this.pendingApprovals.get(featureId);
        if (pending) {
          logger.warn(`Plan approval for feature ${featureId} timed out after 30 minutes`);
          this.pendingApprovals.delete(featureId);
          reject(
            new Error('Plan approval timed out after 30 minutes - feature execution cancelled')
          );
        }
      }, APPROVAL_TIMEOUT_MS);

      // Wrap resolve/reject to clear timeout when approval is resolved
      const wrappedResolve = (result: {
        approved: boolean;
        editedPlan?: string;
        feedback?: string;
      }) => {
        clearTimeout(timeoutId);
        resolve(result);
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      this.pendingApprovals.set(featureId, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        featureId,
        projectPath,
      });
      logger.info(`Pending approval registered for feature ${featureId} (timeout: 30 minutes)`);
    });
  }

  /**
   * Resolve a pending plan approval.
   * Called when the user approves or rejects the plan via API.
   */
  async resolvePlanApproval(
    featureId: string,
    approved: boolean,
    editedPlan?: string,
    feedback?: string,
    projectPathFromClient?: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.info(`resolvePlanApproval called for feature ${featureId}, approved=${approved}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);

    if (!pending) {
      logger.info(`No pending approval in Map for feature ${featureId}`);

      // RECOVERY: If no pending approval but we have projectPath from client,
      // check if feature's planSpec.status is 'generated' and handle recovery
      if (projectPathFromClient) {
        logger.info(`Attempting recovery with projectPath: ${projectPathFromClient}`);
        const feature = await this.loadFeature(projectPathFromClient, featureId);

        if (feature?.planSpec?.status === 'generated') {
          logger.info(`Feature ${featureId} has planSpec.status='generated', performing recovery`);

          if (approved) {
            // Update planSpec to approved
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'approved',
              approvedAt: new Date().toISOString(),
              reviewedByUser: true,
              content: editedPlan || feature.planSpec.content,
            });

            // Get customized prompts from settings
            const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

            // Build continuation prompt using centralized template
            const planContent = editedPlan || feature.planSpec.content || '';
            let continuationPrompt = prompts.taskExecution.continuationAfterApprovalTemplate;
            continuationPrompt = continuationPrompt.replace(
              /\{\{userFeedback\}\}/g,
              feedback || ''
            );
            continuationPrompt = continuationPrompt.replace(/\{\{approvedPlan\}\}/g, planContent);

            logger.info(`Starting recovery execution for feature ${featureId}`);

            // Start feature execution with the continuation prompt (async, don't await)
            // Pass undefined for providedWorktreePath, use options for continuation prompt
            this.executeFeature(projectPathFromClient, featureId, true, false, undefined, {
              continuationPrompt,
            }).catch((error) => {
              logger.error(`Recovery execution failed for feature ${featureId}:`, error);
            });

            return { success: true };
          } else {
            // Rejected - update status and emit event
            await this.updateFeaturePlanSpec(projectPathFromClient, featureId, {
              status: 'rejected',
              reviewedByUser: true,
            });

            await this.updateFeatureStatus(projectPathFromClient, featureId, 'backlog');

            this.emitAutoModeEvent('plan_rejected', {
              featureId,
              projectPath: projectPathFromClient,
              feedback,
            });

            return { success: true };
          }
        }
      }

      logger.info(
        `ERROR: No pending approval found for feature ${featureId} and recovery not possible`
      );
      return {
        success: false,
        error: `No pending approval for feature ${featureId}`,
      };
    }
    logger.info(`Found pending approval for feature ${featureId}, proceeding...`);

    const { projectPath } = pending;

    // Update feature's planSpec status
    await this.updateFeaturePlanSpec(projectPath, featureId, {
      status: approved ? 'approved' : 'rejected',
      approvedAt: approved ? new Date().toISOString() : undefined,
      reviewedByUser: true,
      content: editedPlan, // Update content if user provided an edited version
    });

    // If rejected with feedback, we can store it for the user to see
    if (!approved && feedback) {
      // Emit event so client knows the rejection reason
      this.emitAutoModeEvent('plan_rejected', {
        featureId,
        projectPath,
        feedback,
      });
    }

    // Resolve the promise with all data including feedback
    pending.resolve({ approved, editedPlan, feedback });
    this.pendingApprovals.delete(featureId);

    return { success: true };
  }

  /**
   * Cancel a pending plan approval (e.g., when feature is stopped).
   */
  cancelPlanApproval(featureId: string): void {
    logger.info(`cancelPlanApproval called for feature ${featureId}`);
    logger.info(
      `Current pending approvals: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
    );
    const pending = this.pendingApprovals.get(featureId);
    if (pending) {
      logger.info(`Found and cancelling pending approval for feature ${featureId}`);
      pending.reject(new Error('Plan approval cancelled - feature was stopped'));
      this.pendingApprovals.delete(featureId);
    } else {
      logger.info(`No pending approval to cancel for feature ${featureId}`);
    }
  }

  /**
   * Check if a feature has a pending plan approval.
   */
  hasPendingApproval(featureId: string): boolean {
    return this.pendingApprovals.has(featureId);
  }

  // Private helpers

  /**
   * Find an existing worktree for a given branch by checking git worktree list
   */
  private async findExistingWorktreeForBranch(
    projectPath: string,
    branchName: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const lines = stdout.split('\n');
      let currentPath: string | null = null;
      let currentBranch: string | null = null;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.slice(9);
        } else if (line.startsWith('branch ')) {
          currentBranch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '' && currentPath && currentBranch) {
          // End of a worktree entry
          if (currentBranch === branchName) {
            // Resolve to absolute path - git may return relative paths
            // On Windows, this is critical for cwd to work correctly
            // On all platforms, absolute paths ensure consistent behavior
            const resolvedPath = path.isAbsolute(currentPath)
              ? path.resolve(currentPath)
              : path.resolve(projectPath, currentPath);
            return resolvedPath;
          }
          currentPath = null;
          currentBranch = null;
        }
      }

      // Check the last entry (if file doesn't end with newline)
      if (currentPath && currentBranch && currentBranch === branchName) {
        // Resolve to absolute path for cross-platform compatibility
        const resolvedPath = path.isAbsolute(currentPath)
          ? path.resolve(currentPath)
          : path.resolve(projectPath, currentPath);
        return resolvedPath;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get all branch names that have existing worktrees
   * Used to identify orphaned features (features with branchNames but no worktrees)
   */
  private async getAllWorktreeBranches(projectPath: string): Promise<Set<string>> {
    const branches = new Set<string>();
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('branch ')) {
          const branch = line.slice(7).replace('refs/heads/', '');
          branches.add(branch);
        }
      }
    } catch {
      // If we can't get worktrees, return empty set
      // This will cause all features to be treated as orphaned on main worktree
    }
    return branches;
  }

  /**
   * Create a new worktree for a given branch
   * Returns the worktree path on success, null on failure
   */
  private async createWorktreeForBranch(
    projectPath: string,
    branchName: string,
    feature?: Feature
  ): Promise<string | null> {
    try {
      // Sanitize branch name for directory usage
      const sanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
      const worktreesDir = path.join(projectPath, '.worktrees');
      const worktreePath = path.join(worktreesDir, sanitizedName);

      // Create worktrees directory if it doesn't exist
      await secureFs.mkdir(worktreesDir, { recursive: true });

      // Check if branch exists
      let branchExists = false;
      try {
        await execAsync(`git rev-parse --verify "${branchName}"`, {
          cwd: projectPath,
        });
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      // Create worktree with git identity env vars
      const gitEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: 'Automaker',
        GIT_AUTHOR_EMAIL: 'automaker@localhost',
        GIT_COMMITTER_NAME: 'Automaker',
        GIT_COMMITTER_EMAIL: 'automaker@localhost',
      };

      if (branchExists) {
        // Use existing branch
        await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, {
          cwd: projectPath,
          env: gitEnv,
        });
      } else {
        // Determine base branch: use epic branch if feature belongs to an epic,
        // otherwise use origin/dev as the canonical base (never HEAD which would
        // inherit whatever branch is currently checked out in the main repo).
        let baseBranch = 'origin/dev';
        if (feature?.epicId && !feature.isEpic) {
          try {
            const epicFeature = await this.featureLoader.get(projectPath, feature.epicId);
            if (epicFeature?.branchName) {
              // Verify the epic branch exists before using it as base
              await execAsync(`git rev-parse --verify "${epicFeature.branchName}"`, {
                cwd: projectPath,
              });
              baseBranch = epicFeature.branchName;
              logger.info(
                `Feature ${feature.id} belongs to epic, branching from epic branch: ${baseBranch}`
              );
            }
          } catch {
            logger.warn(
              `Epic branch not found for feature ${feature.id} (epicId: ${feature.epicId}), falling back to HEAD`
            );
          }
        }

        // Create new branch from base (epic branch or HEAD)
        await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" ${baseBranch}`, {
          cwd: projectPath,
          env: gitEnv,
        });
      }

      logger.info(`Created worktree for branch "${branchName}" at: ${worktreePath}`);

      return path.resolve(worktreePath);
    } catch (error) {
      logger.error(`Failed to create worktree for branch "${branchName}":`, error);
      return null;
    }
  }

  private async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const data = (await secureFs.readFile(featurePath, 'utf-8')) as string;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async updateFeatureStatus(
    projectPath: string,
    featureId: string,
    status: string
  ): Promise<void> {
    // Delegate to FeatureStateManager which guarantees persist-before-emit ordering:
    // writes to disk first, then emits events (prevents stale reads on client refresh
    // after server restart triggered by status-change events).
    await this.featureStateManager.updateFeatureStatus(projectPath, featureId, status);
  }

  private isFeatureFinished(feature: Feature): boolean {
    const isCompleted =
      feature.status === 'completed' ||
      feature.status === 'verified' ||
      feature.status === 'done' ||
      feature.status === 'review';

    // Even if marked as completed, if it has an approved plan with pending tasks, it's not finished
    if (feature.planSpec?.status === 'approved') {
      const tasksCompleted = feature.planSpec.tasksCompleted ?? 0;
      const tasksTotal = feature.planSpec.tasksTotal ?? 0;
      if (tasksCompleted < tasksTotal) {
        return false;
      }
    }

    return isCompleted;
  }

  /**
   * Update the planSpec of a feature
   */
  private async updateFeaturePlanSpec(
    projectPath: string,
    featureId: string,
    updates: Partial<PlanSpec>
  ): Promise<void> {
    // Use getFeatureDir helper for consistent path resolution
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      // Use recovery-enabled read for corrupted file handling
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

      // Initialize planSpec if it doesn't exist
      if (!feature.planSpec) {
        feature.planSpec = {
          status: 'pending',
          version: 1,
          reviewedByUser: false,
        };
      }

      // Apply updates
      Object.assign(feature.planSpec, updates);

      // If content is being updated and it's a new version, increment version
      if (updates.content && updates.content !== feature.planSpec.content) {
        feature.planSpec.version = (feature.planSpec.version || 0) + 1;
      }

      feature.updatedAt = new Date().toISOString();

      // Use atomic write with backup support
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });
    } catch (error) {
      logger.error(`Failed to update planSpec for ${featureId}:`, error);
    }
  }

  /**
   * Load pending features for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name to filter by, or null for main worktree (features without branchName)
   */
  private async loadPendingFeatures(
    projectPath: string,
    branchName: string | null = null
  ): Promise<Feature[]> {
    // Features are stored in .automaker directory
    const featuresDir = getFeaturesDir(projectPath);

    // Get the actual primary branch name for the project (e.g., "main", "master", "develop")
    // This is needed to correctly match features when branchName is null (main worktree)
    const primaryBranch = await getCurrentBranch(projectPath);

    // Get all branches that have existing worktrees
    // Used to identify orphaned features (features with branchNames but no worktrees)
    const worktreeBranches = await this.getAllWorktreeBranches(projectPath);

    // Fetch all open PRs once — guards against re-executing features that already have open PRs.
    // Prevents the SPEC_REVIEW gate (or dep-unblocking) from launching duplicate agents.
    const openPrBranches = new Map<string, number>(); // branch → PR number
    let openPrsFetchFailed = false;
    try {
      const { stdout: prJson } = await execAsync(
        'gh pr list --state open --json number,headRefName --limit 200',
        { cwd: projectPath, timeout: 15000 }
      );
      const prs: { number: number; headRefName: string }[] = JSON.parse(prJson || '[]');
      for (const pr of prs) openPrBranches.set(pr.headRefName, pr.number);
      logger.debug(
        `[loadPendingFeatures] Found ${openPrBranches.size} open PR(s) — these branches are excluded from re-execution`
      );
    } catch (err) {
      openPrsFetchFailed = true;
      logger.warn('[loadPendingFeatures] Could not fetch open PRs (non-fatal):', err);
    }

    // Build a secondary index of open PR numbers for prNumber-based lookups.
    // This catches cases where feature.branchName doesn't exactly match the PR's headRefName.
    const openPrNumbers = new Set<number>(openPrBranches.values());

    // Fetch recently merged PRs to reconcile blocked/review features whose PRs already landed.
    // Catches drift from: webhook disabled, server down during merge, or feature blocked before PR was created.
    const mergedPrBranches = new Map<string, { number: number; mergedAt?: string }>(); // branch → PR info
    try {
      const { stdout: mergedPrJson } = await execAsync(
        'gh pr list --state merged --json number,headRefName,mergedAt --limit 100',
        { cwd: projectPath, timeout: 15000 }
      );
      const mergedPrs: { number: number; headRefName: string; mergedAt?: string }[] = JSON.parse(
        mergedPrJson || '[]'
      );
      for (const pr of mergedPrs)
        mergedPrBranches.set(pr.headRefName, { number: pr.number, mergedAt: pr.mergedAt });
      logger.debug(
        `[loadPendingFeatures] Found ${mergedPrBranches.size} recently merged PR(s) — used for stale blocked/review reconciliation`
      );
    } catch (err) {
      logger.warn('[loadPendingFeatures] Could not fetch merged PRs (non-fatal):', err);
    }

    try {
      const entries = await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      });
      const allFeatures: Feature[] = [];
      const pendingFeatures: Feature[] = [];

      // Load all features (for dependency checking) with recovery support
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          // Use recovery-enabled read for corrupted file handling
          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) {
            // Skip features that couldn't be loaded or recovered
            continue;
          }

          // Normalize status to handle legacy values
          const canonicalStatus = normalizeFeatureStatus(feature.status);

          // Push normalized copy to allFeatures so dependency resolution sees canonical statuses
          const normalizedFeature = {
            ...feature,
            status: canonicalStatus,
          };
          allFeatures.push(normalizedFeature);
        }
      }

      // ── Merged PR reconciliation: fix blocked/review features whose PRs already landed ──
      // Runs before dependency evaluation so a done feature doesn't get unblocked back to backlog.
      const staleViaLinkedPr = allFeatures.filter(
        (f) =>
          (f.status === 'blocked' || f.status === 'review') &&
          f.branchName &&
          mergedPrBranches.has(f.branchName)
      );
      for (const feature of staleViaLinkedPr) {
        const mergedPr = mergedPrBranches.get(feature.branchName!)!;
        logger.info(
          `[loadPendingFeatures] Feature ${feature.id} ("${feature.title}") has merged PR #${mergedPr.number} — reconciling to done`
        );
        const prevStatus = feature.status;
        try {
          await this.featureLoader.update(projectPath, feature.id, {
            status: 'done',
            prNumber: mergedPr.number,
            prMergedAt: mergedPr.mergedAt ?? new Date().toISOString(),
          });
          feature.status = 'done';
          this.events.emit('feature:status-changed', {
            projectPath,
            featureId: feature.id,
            previousStatus: prevStatus,
            newStatus: 'done',
          });
        } catch (error) {
          feature.status = prevStatus;
          logger.error(
            `[loadPendingFeatures] Failed to reconcile feature ${feature.id} to done:`,
            error
          );
        }
      }

      // ── Dependency re-evaluation: unblock features whose deps are now satisfied ──
      // Features can be set to 'blocked' when their dependencies aren't ready.
      // When those deps complete, we need to automatically move them back to 'backlog'.
      const blockedWithDeps = allFeatures.filter(
        (f) => f.status === 'blocked' && f.dependencies && f.dependencies.length > 0
      );

      for (const feature of blockedWithDeps) {
        const satisfied = areDependenciesSatisfied(feature, allFeatures);
        if (satisfied) {
          // Guard: if deps are satisfied but feature already has an open PR, sync to 'review'
          // rather than 'backlog' — this prevents duplicate agent launches after SPEC_REVIEW gate
          const existingPrByBranch = feature.branchName
            ? openPrBranches.get(feature.branchName)
            : undefined;
          // Secondary check: if feature already has a stored prNumber and it appears in the
          // open-PR set, treat it as having an open PR even when branchName lookup misses.
          const existingPrByNumber =
            !existingPrByBranch && feature.prNumber && openPrNumbers.has(feature.prNumber)
              ? feature.prNumber
              : undefined;
          // Fallback: when the bulk PR fetch failed, verify the stored prNumber directly via
          // a single gh pr view call to prevent duplicate agent launches on transient API errors.
          let existingPrFallback: number | undefined;
          if (
            !existingPrByBranch &&
            !existingPrByNumber &&
            openPrsFetchFailed &&
            feature.prNumber
          ) {
            try {
              const { stdout: prStateRaw } = await execAsync(
                `gh pr view ${feature.prNumber} --json state --jq '.state'`,
                { cwd: projectPath, timeout: 10000 }
              );
              if (prStateRaw.trim() === 'OPEN') {
                existingPrFallback = feature.prNumber;
                logger.info(
                  `[loadPendingFeatures] Feature ${feature.id} PR #${feature.prNumber} confirmed open via direct check (bulk fetch had failed)`
                );
              }
            } catch (verifyErr) {
              // If we still can't verify, be conservative: assume the PR is open to avoid
              // launching a duplicate agent that will fail with "PR already exists".
              existingPrFallback = feature.prNumber;
              logger.warn(
                `[loadPendingFeatures] Could not verify PR #${feature.prNumber} for feature ${feature.id} — ` +
                  `assuming open to prevent duplicate agent launch: ${verifyErr}`
              );
            }
          }
          const existingPr = existingPrByBranch ?? existingPrByNumber ?? existingPrFallback;
          if (existingPr) {
            logger.info(
              `[loadPendingFeatures] Feature ${feature.id} deps satisfied but has open PR #${existingPr} — syncing to review`
            );
            feature.status = 'review';
            try {
              await this.featureLoader.update(projectPath, feature.id, {
                status: 'review',
                prNumber: existingPr,
              });
              this.events.emit('feature:status-changed', {
                projectPath,
                featureId: feature.id,
                previousStatus: 'blocked',
                newStatus: 'review',
              });
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to sync feature ${feature.id} to review:`,
                error
              );
            }
          } else {
            // Guard: if the feature was blocked due to a git commit / workflow failure,
            // don't re-enqueue it — that would recreate the retry storm. A git workflow
            // failure is not a transient dependency issue, so satisfying deps doesn't fix it.
            // Human intervention is required (e.g. fix .prettierignore, Husky config).
            const changeReason = feature.statusChangeReason ?? '';
            const isGitWorkflowBlock =
              changeReason.includes('git commit') ||
              changeReason.includes('git workflow failed') ||
              changeReason.includes('plan validation failed');
            if (isGitWorkflowBlock) {
              logger.warn(
                `[loadPendingFeatures] Feature ${feature.id} skipping dep-unblock — ` +
                  `blocked after ${feature.failureCount ?? 0} git workflow failure(s). Requires human intervention.`
              );
              continue;
            }

            logger.info(
              `[loadPendingFeatures] Unblocking feature ${feature.id} — all dependencies now satisfied`
            );
            feature.status = 'backlog';
            try {
              await this.featureLoader.update(projectPath, feature.id, { status: 'backlog' });
              this.events.emit('feature:status-changed', {
                projectPath,
                featureId: feature.id,
                previousStatus: 'blocked',
                newStatus: 'backlog',
              });
            } catch (error) {
              logger.error(`[loadPendingFeatures] Failed to unblock feature ${feature.id}:`, error);
            }
          }
        }
      }

      // ── Filter eligible features for execution ──
      for (const feature of allFeatures) {
        const canonicalStatus = feature.status;

        // Track pending features separately, filtered by worktree/branch
        // Note: Features in 'review', 'done', or 'verified' are NOT eligible
        // Those features have completed execution and should not be picked up again
        const isEligibleStatus =
          canonicalStatus === 'backlog' ||
          (canonicalStatus !== 'done' &&
            canonicalStatus !== 'verified' &&
            canonicalStatus !== 'review' &&
            canonicalStatus !== 'in_progress' &&
            canonicalStatus !== 'blocked' &&
            feature.planSpec?.status === 'approved' &&
            (feature.planSpec.tasksCompleted ?? 0) < (feature.planSpec.tasksTotal ?? 0));

        // Log ALL features with their eligibility status for debugging
        logger.debug(
          `[loadPendingFeatures] Feature ${feature.id}: status="${feature.status}", assignee="${feature.assignee ?? 'null'}", isEpic=${feature.isEpic ?? false}, branchName="${feature.branchName ?? 'null'}", eligible=${isEligibleStatus}`
        );

        if (isEligibleStatus) {
          // Skip epic features - they are containers, not executable
          if (feature.isEpic) {
            logger.info(
              `[loadPendingFeatures] ❌ Skipping epic feature ${feature.id} - ${feature.title}`
            );
            continue;
          }

          // Skip features assigned to humans (non-agent assignees)
          if (feature.assignee && feature.assignee !== 'agent') {
            logger.info(
              `[loadPendingFeatures] ❌ Skipping feature ${feature.id} - assigned to "${feature.assignee}" (not agent)`
            );
            continue;
          }

          // Guard: if feature already has an open PR, sync it to 'review' and skip execution.
          // Prevents duplicate agent launches when SPEC_REVIEW gate or dep-unblocking races
          // with an existing in-flight PR.
          // Pre-flight check per feature description: if a feature already has a prNumber
          // and that PR is still open on GitHub, skip agent launch and move to review instead.
          const existingPrByBranchFilter = feature.branchName
            ? openPrBranches.get(feature.branchName)
            : undefined;
          // Secondary check: if feature has a stored prNumber, look it up in the open PR number
          // set — catches cases where branchName doesn't exactly match the PR's headRefName.
          const existingPrByNumberFilter =
            !existingPrByBranchFilter && feature.prNumber && openPrNumbers.has(feature.prNumber)
              ? feature.prNumber
              : undefined;
          // Fallback: when the bulk PR fetch failed, verify the stored prNumber directly.
          // This is the primary safeguard against the re-launch cycle: even if the gh pr list
          // call returned a 502, we can still check the individual PR to avoid wasted runs.
          let existingPrFallbackFilter: number | undefined;
          if (
            !existingPrByBranchFilter &&
            !existingPrByNumberFilter &&
            openPrsFetchFailed &&
            feature.prNumber
          ) {
            try {
              const { stdout: prStateRaw } = await execAsync(
                `gh pr view ${feature.prNumber} --json state --jq '.state'`,
                { cwd: projectPath, timeout: 10000 }
              );
              if (prStateRaw.trim() === 'OPEN') {
                existingPrFallbackFilter = feature.prNumber;
                logger.info(
                  `[loadPendingFeatures] Feature ${feature.id} PR #${feature.prNumber} confirmed open via direct check — skipping agent launch`
                );
              }
            } catch (verifyErr) {
              // If we still can't verify, be conservative: assume the PR is open to avoid
              // launching a duplicate agent that will fail with "PR already exists".
              existingPrFallbackFilter = feature.prNumber;
              logger.warn(
                `[loadPendingFeatures] Could not verify PR #${feature.prNumber} for feature ${feature.id} — ` +
                  `assuming open to prevent duplicate agent launch: ${verifyErr}`
              );
            }
          }
          const existingPrFilter =
            existingPrByBranchFilter ?? existingPrByNumberFilter ?? existingPrFallbackFilter;
          if (existingPrFilter) {
            logger.info(
              `[loadPendingFeatures] ⏭ Feature ${feature.id} has open PR #${existingPrFilter} — syncing to review, skipping execution`
            );
            try {
              await this.featureLoader.update(projectPath, feature.id, {
                status: 'review',
                prNumber: existingPrFilter,
              });
              this.events.emit('feature:status-changed', {
                projectPath,
                featureId: feature.id,
                previousStatus: feature.status,
                newStatus: 'review',
              });
            } catch (error) {
              logger.error(
                `[loadPendingFeatures] Failed to sync feature ${feature.id} to review:`,
                error
              );
            }
            continue;
          }

          // Filter by branchName:
          // - If branchName is null (main worktree), include features with:
          //   - branchName === null (unassigned), OR
          //   - branchName === primaryBranch (e.g., "main", "master", "develop"), OR
          //   - branchName has no corresponding worktree (orphaned - will auto-create worktree)
          // - If branchName is set, only include features with matching branchName
          const featureBranch = feature.branchName ?? null;
          if (branchName === null) {
            // Main worktree: include features that are unassigned, on primary branch, or orphaned
            const isPrimaryOrUnassigned =
              featureBranch === null || (primaryBranch && featureBranch === primaryBranch);
            // Orphaned = has branchName but no corresponding worktree exists
            const isOrphaned = featureBranch !== null && !worktreeBranches.has(featureBranch);
            // Stale worktree = has branchName with existing worktree BUT feature is in backlog
            // This happens when a previous agent attempt created the worktree but failed before starting.
            // The agent service will reuse the existing worktree, so we should include these.
            const hasStaleWorktree =
              featureBranch !== null &&
              worktreeBranches.has(featureBranch) &&
              (feature.status === 'backlog' ||
                feature.status === 'pending' ||
                feature.status === 'ready');

            logger.debug(
              `[loadPendingFeatures] Feature ${feature.id} branch filter - featureBranch: ${featureBranch}, primaryBranch: ${primaryBranch}, isPrimaryOrUnassigned: ${isPrimaryOrUnassigned}, isOrphaned: ${isOrphaned}, hasStaleWorktree: ${hasStaleWorktree}`
            );

            if (isPrimaryOrUnassigned || isOrphaned || hasStaleWorktree) {
              if (hasStaleWorktree) {
                logger.info(
                  `[loadPendingFeatures] ✅ Including feature ${feature.id} with stale worktree (branchName: ${featureBranch}, status: ${feature.status}) for main worktree`
                );
              } else if (isOrphaned) {
                logger.info(
                  `[loadPendingFeatures] ✅ Including orphaned feature ${feature.id} (branchName: ${featureBranch} has no worktree) for main worktree`
                );
              } else {
                logger.info(
                  `[loadPendingFeatures] ✅ Including feature ${feature.id} for main worktree (featureBranch: ${featureBranch})`
                );
              }
              pendingFeatures.push(feature);
            } else {
              // Feature belongs to a specific worktree AND is actively being worked on (in_progress)
              logger.info(
                `[loadPendingFeatures] ❌ Filtering out feature ${feature.id} (branchName: ${featureBranch} has worktree, status: ${feature.status}) for main worktree`
              );
            }
          } else {
            // Feature worktree: include features with matching branchName
            if (featureBranch === branchName) {
              logger.info(
                `[loadPendingFeatures] ✅ Including feature ${feature.id} for worktree ${branchName}`
              );
              pendingFeatures.push(feature);
            } else {
              logger.info(
                `[loadPendingFeatures] ❌ Filtering out feature ${feature.id} (branchName: ${featureBranch}, expected: ${branchName}) for worktree ${branchName}`
              );
            }
          }
        }
      }

      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(
        `[loadPendingFeatures] Found ${allFeatures.length} total features, ${pendingFeatures.length} candidates (pending/ready/backlog/approved_with_pending_tasks) for ${worktreeDesc}`
      );

      if (pendingFeatures.length === 0) {
        logger.warn(
          `[loadPendingFeatures] No pending features found for ${worktreeDesc}. Check branchName matching - looking for branchName: ${branchName === null ? 'null (main)' : branchName}`
        );
        // Log all backlog features to help debug branchName matching
        const allBacklogFeatures = allFeatures.filter(
          (f) =>
            f.status === 'backlog' ||
            f.status === 'pending' ||
            f.status === 'ready' ||
            (f.planSpec?.status === 'approved' &&
              (f.planSpec.tasksCompleted ?? 0) < (f.planSpec.tasksTotal ?? 0))
        );
        if (allBacklogFeatures.length > 0) {
          logger.info(
            `[loadPendingFeatures] Found ${allBacklogFeatures.length} backlog features with branchNames: ${allBacklogFeatures.map((f) => `${f.id}(${f.branchName ?? 'null'})`).join(', ')}`
          );
        }
      }

      // Apply dependency-aware ordering
      const { orderedFeatures, missingDependencies } = resolveDependencies(pendingFeatures);

      // Remove TRULY missing dependencies (feature ID doesn't exist anywhere on the board).
      // Dependencies that exist in allFeatures but not in pendingFeatures are NOT missing —
      // they're just in a different status (in_progress, done, review, etc.).
      // Previously, this code removed deps on features in non-pending statuses, causing
      // downstream features to start before their prerequisites completed.
      if (missingDependencies.size > 0) {
        const allFeatureIds = new Set(allFeatures.map((f) => f.id));

        for (const [featureId, missingDepIds] of missingDependencies) {
          const feature = pendingFeatures.find((f) => f.id === featureId);
          if (feature && feature.dependencies) {
            // Only remove deps that are TRULY gone (not on the board at all)
            const trulyMissingDepIds = missingDepIds.filter((depId) => !allFeatureIds.has(depId));

            if (trulyMissingDepIds.length > 0) {
              const validDependencies = feature.dependencies.filter(
                (depId) => !trulyMissingDepIds.includes(depId)
              );

              logger.warn(
                `[loadPendingFeatures] Feature ${featureId} has truly missing dependencies (deleted from board): ${trulyMissingDepIds.join(', ')}. Removing them.`
              );

              // Update the feature in memory
              feature.dependencies = validDependencies.length > 0 ? validDependencies : undefined;

              // Save the updated feature to disk
              try {
                await this.featureLoader.update(projectPath, featureId, {
                  dependencies: feature.dependencies,
                });
                logger.info(
                  `[loadPendingFeatures] Updated feature ${featureId} - removed truly missing dependencies`
                );
              } catch (error) {
                logger.error(
                  `[loadPendingFeatures] Failed to save feature ${featureId} after removing missing dependencies:`,
                  error
                );
              }
            } else {
              // All "missing" deps actually exist on the board in non-pending statuses
              // This is normal — they're in_progress, done, review, etc.
              const depStatuses = missingDepIds.map((depId) => {
                const dep = allFeatures.find((f) => f.id === depId);
                return `${depId.slice(-12)}(${dep?.status || 'unknown'})`;
              });
              logger.debug(
                `[loadPendingFeatures] Feature ${featureId} has deps in non-pending statuses: ${depStatuses.join(', ')}. Preserving dependencies.`
              );
            }
          }
        }
      }

      // Get skipVerificationInAutoMode setting
      const settings = await this.settingsService?.getGlobalSettings();
      const skipVerification = settings?.skipVerificationInAutoMode ?? false;

      // Filter to only features with satisfied dependencies
      const readyFeatures: Feature[] = [];
      const blockedFeatures: Array<{ feature: Feature; reason: string }> = [];

      for (const feature of orderedFeatures) {
        const isSatisfied = areDependenciesSatisfied(feature, allFeatures, { skipVerification });
        if (isSatisfied) {
          readyFeatures.push(feature);
        } else {
          // Find which dependencies are blocking
          const blockingDeps =
            feature.dependencies?.filter((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              if (!dep) return true; // Missing dependency
              if (skipVerification) {
                // When skipVerification is enabled, only block if dependency is actively running
                return dep.status === 'running' || dep.status === 'in_progress';
              }
              // Foundation deps require 'done' (merged) — 'review' is NOT sufficient
              if (dep.isFoundation) {
                return (
                  dep.status !== 'done' && dep.status !== 'completed' && dep.status !== 'verified'
                );
              }
              // Default: block unless dependency is in a completed state
              return (
                dep.status !== 'completed' && dep.status !== 'verified' && dep.status !== 'done'
              );
            }) || [];

          // Include foundation context in reason for better diagnostics
          const reason = blockingDeps
            .map((depId) => {
              const dep = allFeatures.find((f) => f.id === depId);
              const suffix = dep?.isFoundation ? ' [foundation - needs merge]' : '';
              return `${depId}(${dep?.status || 'missing'})${suffix}`;
            })
            .join(', ');

          blockedFeatures.push({
            feature,
            reason: reason ? `Blocked by dependencies: ${reason}` : 'Unknown dependency issue',
          });
        }
      }

      if (blockedFeatures.length > 0) {
        logger.info(
          `[loadPendingFeatures] ${blockedFeatures.length} features blocked by dependencies: ${blockedFeatures.map((b) => `${b.feature.id} (${b.reason})`).join('; ')}`
        );
      }

      // ── Human-blocked dependency detection and escalation ──
      // Categorize blocked features by whether they're blocked by human-assigned dependencies
      const humanBlockedFeatures: Array<{ feature: Feature; humanBlockers: string[] }> = [];
      const agentBlockedFeatures: Array<{ feature: Feature; agentBlockers: string[] }> = [];

      for (const blocked of blockedFeatures) {
        const blockingInfo = getBlockingInfo(blocked.feature, allFeatures);

        if (blockingInfo.humanBlockers.length > 0) {
          humanBlockedFeatures.push({
            feature: blocked.feature,
            humanBlockers: blockingInfo.humanBlockers,
          });

          // Get human blocker details for logging and escalation
          const humanBlockerDetails = blockingInfo.humanBlockers
            .map((blockerId) => {
              const blocker = allFeatures.find((f) => f.id === blockerId);
              return blocker
                ? `${blockerId} (assigned to ${blocker.assignee || 'unknown'})`
                : blockerId;
            })
            .join(', ');

          // Log distinctly: '[loadPendingFeatures] Feature X human-blocked by Y (assigned to josh)'
          logger.warn(
            `[loadPendingFeatures] Feature ${blocked.feature.id} human-blocked by ${humanBlockerDetails}`
          );

          // Emit escalation signal for each human-blocked feature (medium severity)
          if (this.events) {
            this.events.emit('escalation:signal-received', {
              source: EscalationSource.human_blocked_dependency,
              severity: EscalationSeverity.medium,
              type: 'feature_human_blocked',
              context: {
                featureId: blocked.feature.id,
                featureTitle: blocked.feature.title || blocked.feature.description,
                humanBlockers: blockingInfo.humanBlockers,
                humanBlockerDetails,
                projectPath,
                branchName,
              },
              deduplicationKey: `human-blocked-${blocked.feature.id}-${blockingInfo.humanBlockers.join('-')}`,
              timestamp: new Date().toISOString(),
            });
          }
        } else if (blockingInfo.agentBlockers.length > 0) {
          agentBlockedFeatures.push({
            feature: blocked.feature,
            agentBlockers: blockingInfo.agentBlockers,
          });
        }
      }

      // Update project state with human-blocked count
      const worktreeKey = this.coordinator.makeKey(projectPath, branchName);
      const projectState = this.coordinator.getState(worktreeKey);
      if (projectState) {
        projectState.humanBlockedCount = humanBlockedFeatures.length;
      }

      // Log summary of human-blocked vs agent-blocked features
      if (humanBlockedFeatures.length > 0 || agentBlockedFeatures.length > 0) {
        logger.info(
          `[loadPendingFeatures] Blocked feature breakdown: ${humanBlockedFeatures.length} human-blocked, ${agentBlockedFeatures.length} agent-blocked`
        );
      }

      // ── Pipeline stall detection: ALL remaining features are human-blocked (code red) ──
      // If we have blocked features and ALL of them are human-blocked (no agent-blocked, no ready),
      // this means the entire pipeline is stalled waiting on human work
      const totalPendingCount = orderedFeatures.length;
      const allFeaturesHumanBlocked =
        humanBlockedFeatures.length > 0 &&
        humanBlockedFeatures.length === totalPendingCount &&
        readyFeatures.length === 0;

      if (allFeaturesHumanBlocked) {
        logger.error(
          `[loadPendingFeatures] 🚨 PIPELINE STALLED: All ${totalPendingCount} remaining features are human-blocked. No agent work can proceed.`
        );

        // Emit critical escalation signal
        if (this.events) {
          this.events.emit('escalation:signal-received', {
            source: EscalationSource.human_blocked_dependency,
            severity: EscalationSeverity.critical,
            type: 'pipeline_stalled_human_blocked',
            context: {
              totalFeatures: totalPendingCount,
              humanBlockedCount: humanBlockedFeatures.length,
              humanBlockedFeatureIds: humanBlockedFeatures.map((hb) => hb.feature.id),
              projectPath,
              branchName,
              message: `All ${totalPendingCount} remaining features are blocked by human-assigned dependencies. Pipeline is stalled.`,
            },
            deduplicationKey: `pipeline-stalled-${projectPath}-${branchName ?? 'main'}`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Sort by priority (lower number = higher priority, picked up first)
      // 0 = No priority and undefined both default to 3 (Normal) for sorting
      const priorityOrder = (p?: number | null): number => (p === 0 || p == null ? 3 : p);
      readyFeatures.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));

      logger.info(
        `[loadPendingFeatures] After dependency filtering: ${readyFeatures.length} ready features (skipVerification=${skipVerification})`
      );

      return readyFeatures;
    } catch (error) {
      logger.error(`[loadPendingFeatures] Error loading features:`, error);
      return [];
    }
  }

  /**
   * Extract a title from feature description (first line or truncated)
   */
  private extractTitleFromDescription(description: string): string {
    if (!description || !description.trim()) {
      return 'Untitled Feature';
    }

    // Get first line, or first 60 characters if no newline
    const firstLine = description.split('\n')[0].trim();
    if (firstLine.length <= 60) {
      return firstLine;
    }

    // Truncate to 60 characters and add ellipsis
    return firstLine.substring(0, 57) + '...';
  }

  private buildFeaturePrompt(
    feature: Feature,
    taskExecutionPrompts: {
      implementationInstructions: string;
      playwrightVerificationInstructions: string;
    }
  ): string {
    const title = this.extractTitleFromDescription(feature.description);

    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    // Add images note (like old implementation)
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      const imagesList = feature.imagePaths
        .map((img, idx) => {
          const path = typeof img === 'string' ? img : img.path;
          const filename =
            typeof img === 'string' ? path.split('/').pop() : img.filename || path.split('/').pop();
          const mimeType = typeof img === 'string' ? 'image/*' : img.mimeType || 'image/*';
          return `   ${idx + 1}. ${filename} (${mimeType})\n      Path: ${path}`;
        })
        .join('\n');

      prompt += `
**📎 Context Images Attached:**
The user has attached ${feature.imagePaths.length} image(s) for context. These images are provided both visually (in the initial message) and as files you can read:

${imagesList}

You can use the Read tool to view these images at any time during implementation. Review them carefully before implementing.
`;
    }

    // Add verification instructions based on testing mode
    if (feature.skipTests) {
      // Manual verification - just implement the feature
      prompt += `\n${taskExecutionPrompts.implementationInstructions}`;
    } else {
      // Automated testing - implement and verify with Playwright
      prompt += `\n${taskExecutionPrompts.implementationInstructions}\n\n${taskExecutionPrompts.playwrightVerificationInstructions}`;
    }

    return prompt;
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Build the feature prompt
    const featurePrompt = this.buildFeaturePrompt(feature, prompts.taskExecution);

    // Use the resume feature template with variable substitution
    let prompt = prompts.taskExecution.resumeFeatureTemplate;
    prompt = prompt.replace(/\{\{featurePrompt\}\}/g, featurePrompt);
    prompt = prompt.replace(/\{\{previousContext\}\}/g, context);

    return this.executeFeature(projectPath, featureId, useWorktrees, false, undefined, {
      continuationPrompt: prompt,
    });
  }

  /**
   * Resume or restart an agent with additional feedback context.
   * If the agent is already running, this will throw an error.
   * If not running, it will start execution with the feedback included in the prompt.
   *
   * @param projectPath - The main project path
   * @param featureId - The feature ID to resume
   * @param feedback - Additional feedback/context to include in the prompt
   */
  async resumeWithFeedback(
    projectPath: string,
    featureId: string,
    feedback: string
  ): Promise<void> {
    // Check if already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error('Feature is already running');
    }

    // Load feature to check it exists
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Emit follow-up started event
    this.events.emit('feature:follow-up-started', {
      featureId,
      projectPath,
      feedback,
    });

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Build the feature prompt
    const featurePrompt = this.buildFeaturePrompt(feature, prompts.taskExecution);

    // Check if there's existing context
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    let previousContext = '';
    try {
      await secureFs.access(contextPath);
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context, that's okay
    }

    // Build continuation prompt with feedback
    let prompt: string;
    if (previousContext) {
      // Use resume template with feedback added
      prompt = prompts.taskExecution.resumeFeatureTemplate;
      prompt = prompt.replace(/\{\{featurePrompt\}\}/g, featurePrompt);
      prompt = prompt.replace(/\{\{previousContext\}\}/g, previousContext);
      prompt += `\n\n## Additional Feedback\n\n${feedback}`;
    } else {
      // No previous context, start fresh with feedback
      prompt = `${featurePrompt}\n\n## Additional Feedback\n\n${feedback}`;
    }

    // Execute with the feedback-enhanced prompt
    return this.executeFeature(projectPath, featureId, true, false, undefined, {
      continuationPrompt: prompt,
    });
  }

  /**
   * Detect if a feature is stuck in a pipeline step and extract step information.
   * Parses the feature status to determine if it's a pipeline status (e.g., 'pipeline_step_xyz'),
   * loads the pipeline configuration, and validates that the step still exists.
   *
   * This method handles several scenarios:
   * - Non-pipeline status: Returns default PipelineStatusInfo with isPipeline=false
   * - Invalid pipeline status format: Returns isPipeline=true but null step info
   * - Step deleted from config: Returns stepIndex=-1 to signal missing step
   * - Valid pipeline step: Returns full step information and config
   *
   * @param {string} projectPath - Absolute path to the project directory
   * @param {string} featureId - Unique identifier of the feature
   * @param {FeatureStatusWithPipeline} currentStatus - Current feature status (may include pipeline step info)
   * @returns {Promise<PipelineStatusInfo>} Information about the pipeline status and step
   * @private
   */
  private async detectPipelineStatus(
    projectPath: string,
    featureId: string,
    currentStatus: FeatureStatusWithPipeline
  ): Promise<PipelineStatusInfo> {
    // Check if status is pipeline format using PipelineService
    const isPipeline = pipelineService.isPipelineStatus(currentStatus);

    if (!isPipeline) {
      return {
        isPipeline: false,
        stepId: null,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    }

    // Extract step ID using PipelineService
    const stepId = pipelineService.getStepIdFromStatus(currentStatus);

    if (!stepId) {
      logger.warn(`Feature ${featureId} has invalid pipeline status format: ${currentStatus}`);
      return {
        isPipeline: true,
        stepId: null,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    }

    // Load pipeline config
    const config = await pipelineService.getPipelineConfig(projectPath);

    if (!config || config.steps.length === 0) {
      // Pipeline config doesn't exist or empty - feature stuck with invalid pipeline status
      logger.warn(`Feature ${featureId} has pipeline status but no pipeline config exists`);
      return {
        isPipeline: true,
        stepId,
        stepIndex: -1,
        totalSteps: 0,
        step: null,
        config: null,
      };
    }

    // Find the step directly from config (already loaded, avoid redundant file read)
    const sortedSteps = [...config.steps].sort((a, b) => a.order - b.order);
    const stepIndex = sortedSteps.findIndex((s) => s.id === stepId);
    const step = stepIndex === -1 ? null : sortedSteps[stepIndex];

    if (!step) {
      // Step not found in current config - step was deleted/changed
      logger.warn(
        `Feature ${featureId} stuck in step ${stepId} which no longer exists in pipeline config`
      );
      return {
        isPipeline: true,
        stepId,
        stepIndex: -1,
        totalSteps: sortedSteps.length,
        step: null,
        config,
      };
    }

    logger.debug(
      `Detected pipeline status for feature ${featureId}: step ${stepIndex + 1}/${sortedSteps.length} (${step.name})`
    );

    return {
      isPipeline: true,
      stepId,
      stepIndex,
      totalSteps: sortedSteps.length,
      step,
      config,
    };
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   * Rate-limits auto_mode_progress events to max 1 per 100ms per feature.
   */
  private emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void {
    this.typedEventBus.emitAutoModeEvent(eventType, data);
  }

  /**
   * Check current heap usage and return percentage
   */
  private getHeapUsagePercent(): number {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    // Use heap_size_limit (actual max from --max-old-space-size) instead of heapTotal
    // (current allocation). V8 grows heapTotal conservatively, so heapUsed/heapTotal
    // is naturally 70-90% even for idle processes — causing false positives that
    // silently block all agent starts.
    return memoryUsage.heapUsed / heapStats.heap_size_limit;
  }

  /**
   * Get the most recently started running feature for a project (to abort if needed)
   */
  private getMostRecentRunningFeature(projectPath: string): RunningFeature | null {
    let mostRecent: RunningFeature | null = null;
    let mostRecentTime = 0;

    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath && feature.startTime) {
        if (feature.startTime > mostRecentTime) {
          mostRecentTime = feature.startTime;
          mostRecent = feature;
        }
      }
    }

    return mostRecent;
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      // If signal is provided and already aborted, reject immediately
      if (signal?.aborted) {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
        return;
      }

      // Listen for abort signal
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          },
          { once: true }
        );
      }
    });
  }

  // ============================================================================
  // Execution State Persistence - For recovery after server restart
  // ============================================================================

  /**
   * Save execution state to disk for recovery after server restart
   */
  private async saveExecutionState(projectPath: string): Promise<void> {
    try {
      await ensureAutomakerDir(projectPath);
      const statePath = getExecutionStatePath(projectPath);
      const state: ExecutionState = {
        version: 1,
        autoLoopWasRunning: this.autoLoopRunning,
        maxConcurrency: this.config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
        projectPath,
        branchName: null, // Legacy global auto mode uses main worktree
        runningFeatureIds: Array.from(this.runningFeatures.keys()),
        savedAt: new Date().toISOString(),
      };
      await secureFs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
      logger.info(`Saved execution state: ${state.runningFeatureIds.length} running features`);
    } catch (error) {
      logger.error('Failed to save execution state:', error);
    }
  }

  /**
   * Load execution state from disk
   */
  private async loadExecutionState(projectPath: string): Promise<ExecutionState> {
    try {
      const statePath = getExecutionStatePath(projectPath);
      const content = (await secureFs.readFile(statePath, 'utf-8')) as string;
      const state = JSON.parse(content) as ExecutionState;
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load execution state:', error);
      }
      return DEFAULT_EXECUTION_STATE;
    }
  }

  /**
   * Clear execution state (called on successful shutdown or when auto-loop stops)
   */
  private async clearExecutionState(
    projectPath: string,
    branchName: string | null = null
  ): Promise<void> {
    try {
      const statePath = getExecutionStatePath(projectPath);
      await secureFs.unlink(statePath);
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(`Cleared execution state for ${worktreeDesc}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to clear execution state:', error);
      }
    }
  }

  /**
   * Clean up stale running features from previous server sessions.
   * This prevents "already running" errors on restart.
   */
  private cleanupStaleRunningFeatures(): void {
    if (this.runningFeatures.size > 0) {
      logger.warn(
        `Clearing ${this.runningFeatures.size} stale running feature(s) from previous session`
      );
      this.runningFeatures.clear();
    }
  }

  /**
   * Check for and resume interrupted features after server restart
   * This should be called during server initialization
   */
  async resumeInterruptedFeatures(projectPath: string): Promise<void> {
    // Only run once per project per server lifecycle.
    // The UI calls this on every board mount — subsequent calls are no-ops.
    if (this.resumeCheckedProjects.has(projectPath)) {
      logger.debug(`Already checked interrupted features for ${projectPath}, skipping`);
      return;
    }
    this.resumeCheckedProjects.add(projectPath);

    logger.info('Checking for interrupted features to resume...');

    // Clean up any stale running features from previous session
    this.cleanupStaleRunningFeatures();

    // Load all features and find those that were interrupted
    const featuresDir = getFeaturesDir(projectPath);

    try {
      const entries = await secureFs.readdir(featuresDir, { withFileTypes: true });
      const interruptedFeatures: Feature[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(featuresDir, entry.name, 'feature.json');

          // Use recovery-enabled read for corrupted file handling
          const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
            maxBackups: DEFAULT_BACKUP_COUNT,
            autoRestore: true,
          });

          logRecoveryWarning(result, `Feature ${entry.name}`, logger);

          const feature = result.data;
          if (!feature) {
            // Skip features that couldn't be loaded or recovered
            continue;
          }

          // Check if feature was interrupted (in_progress, interrupted, or pipeline_*)
          if (
            feature.status === 'in_progress' ||
            feature.status === 'interrupted' ||
            (feature.status && feature.status.startsWith('pipeline_'))
          ) {
            // Verify it has existing context (agent-output.md)
            const featureDir = getFeatureDir(projectPath, feature.id);
            const contextPath = path.join(featureDir, 'agent-output.md');
            try {
              await secureFs.access(contextPath);
              interruptedFeatures.push(feature);
              logger.info(
                `Found interrupted feature: ${feature.id} (${feature.title}) - status: ${feature.status}`
              );
            } catch {
              // No context file — still include interrupted features (they get started fresh)
              if (feature.status === 'interrupted') {
                interruptedFeatures.push(feature);
                logger.info(`Interrupted feature ${feature.id} has no context, will restart fresh`);
              } else {
                logger.info(`Interrupted feature ${feature.id} has no context, will restart fresh`);
              }
            }
          }
        }
      }

      if (interruptedFeatures.length === 0) {
        logger.info('No interrupted features found');
        return;
      }

      logger.info(`Found ${interruptedFeatures.length} interrupted feature(s) to resume`);

      // Emit event to notify UI
      this.emitAutoModeEvent('auto_mode_resuming_features', {
        message: `Resuming ${interruptedFeatures.length} interrupted feature(s) after server restart`,
        projectPath,
        featureIds: interruptedFeatures.map((f) => f.id),
        features: interruptedFeatures.map((f) => ({
          id: f.id,
          title: f.title,
          status: f.status,
          branchName: f.branchName ?? null,
        })),
      });

      // Resume each interrupted feature
      for (const feature of interruptedFeatures) {
        try {
          logger.info(`Resuming feature: ${feature.id} (${feature.title})`);
          // Use resumeFeature which will detect the existing context and continue
          await this.resumeFeature(projectPath, feature.id, true);
        } catch (error) {
          logger.error(`Failed to resume feature ${feature.id}:`, error);
          // Continue with other features
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No features directory found, nothing to resume');
      } else {
        logger.error('Error checking for interrupted features:', error);
      }
    }
  }
}
