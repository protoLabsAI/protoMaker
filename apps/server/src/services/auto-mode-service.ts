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
} from '@protolabs-ai/types';
import {
  DEFAULT_PHASE_MODELS,
  DEFAULT_MAX_CONCURRENCY,
  MAX_SYSTEM_CONCURRENCY,
  isClaudeModel,
  stripProviderPrefix,
  normalizeFeatureStatus,
} from '@protolabs-ai/types';
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
} from '@protolabs-ai/utils';

const logger = createLogger('AutoMode');
import {
  resolveModelString,
  resolvePhaseModel,
  DEFAULT_MODELS,
} from '@protolabs-ai/model-resolver';
import { resolveDependencies, areDependenciesSatisfied } from '@protolabs-ai/dependency-resolver';
import {
  getFeatureDir,
  getAutomakerDir,
  getFeaturesDir,
  getExecutionStatePath,
  ensureAutomakerDir,
} from '@protolabs-ai/platform';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
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
import { graphiteService } from './graphite-service.js';
import type { KnowledgeStoreService } from './knowledge-store-service.js';

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

// PlanningMode type is imported from @protolabs-ai/types

// Model selection for features is handled by AutoModeService.getModelForFeature() class method
// which reads the user-configured agentExecutionModel from settings.

/**
 * Complexity-to-turns mapping.
 * Maps feature complexity to appropriate max turns for agent execution.
 * Higher complexity = more turns allowed.
 */
const COMPLEXITY_TURNS: Record<string, number> = {
  small: 200,
  medium: 500,
  large: 750,
  architectural: 1000,
};

/**
 * Get the max turns for a feature based on its complexity.
 * Per-feature maxTurns override takes precedence.
 * Failure escalation: after error_max_turns, turns are bumped (1.5x first, 2x+opus second).
 */
function getTurnsForFeature(feature: {
  maxTurns?: number;
  complexity?: string;
  failureCount?: number;
}): number {
  // Explicit per-feature override takes precedence
  if (feature.maxTurns && feature.maxTurns > 0) {
    return feature.maxTurns;
  }

  const baseTurns = COMPLEXITY_TURNS[feature.complexity ?? 'medium'] ?? COMPLEXITY_TURNS.medium;

  // After failures, escalate turns (the model escalation is handled by getModelForFeature)
  const failureCount = feature.failureCount ?? 0;
  if (failureCount >= 2) {
    // 2+ failures: double the turns
    return Math.min(baseTurns * 2, 2000);
  }
  if (failureCount >= 1) {
    // 1 failure: 1.5x the turns
    return Math.min(Math.round(baseTurns * 1.5), 1500);
  }

  return baseTurns;
}

interface ParsedTask {
  id: string; // e.g., "T001"
  description: string; // e.g., "Create user model"
  filePath?: string; // e.g., "src/models/user.ts"
  phase?: string; // e.g., "Phase 1: Foundation" (for full mode)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface PlanSpec {
  status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
  content?: string;
  version: number;
  generatedAt?: string;
  approvedAt?: string;
  reviewedByUser: boolean;
  tasksCompleted?: number;
  tasksTotal?: number;
  currentTaskId?: string;
  tasks?: ParsedTask[];
}

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

/**
 * Parse tasks from generated spec content
 * Looks for the ```tasks code block and extracts task lines
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTasksFromSpec(specContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Extract content within ```tasks ... ``` block
  const tasksBlockMatch = specContent.match(/```tasks\s*([\s\S]*?)```/);
  if (!tasksBlockMatch) {
    // Try fallback: look for task lines anywhere in content
    const taskLines = specContent.match(/- \[ \] T\d{3}:.*$/gm);
    if (!taskLines) {
      return tasks;
    }
    // Parse fallback task lines
    let currentPhase: string | undefined;
    for (const line of taskLines) {
      const parsed = parseTaskLine(line, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
    return tasks;
  }

  const tasksContent = tasksBlockMatch[1];
  const lines = tasksContent.split('\n');

  let currentPhase: string | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for phase header (e.g., "## Phase 1: Foundation")
    const phaseMatch = trimmedLine.match(/^##\s*(.+)$/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // Check for task line
    if (trimmedLine.startsWith('- [ ]')) {
      const parsed = parseTaskLine(trimmedLine, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
  }

  return tasks;
}

/**
 * Parse a single task line
 * Format: - [ ] T###: Description | File: path/to/file
 */
function parseTaskLine(line: string, currentPhase?: string): ParsedTask | null {
  // Match pattern: - [ ] T###: Description | File: path
  const taskMatch = line.match(/- \[ \] (T\d{3}):\s*([^|]+)(?:\|\s*File:\s*(.+))?$/);
  if (!taskMatch) {
    // Try simpler pattern without file
    const simpleMatch = line.match(/- \[ \] (T\d{3}):\s*(.+)$/);
    if (simpleMatch) {
      return {
        id: simpleMatch[1],
        description: simpleMatch[2].trim(),
        phase: currentPhase,
        status: 'pending',
      };
    }
    return null;
  }

  return {
    id: taskMatch[1],
    description: taskMatch[2].trim(),
    filePath: taskMatch[3]?.trim(),
    phase: currentPhase,
    status: 'pending',
  };
}

interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
  model?: string;
  provider?: ModelProvider;
  // Recovery tracking
  retryCount: number;
  previousErrors: string[];
  recoveryContext?: string;
}

interface AutoLoopState {
  projectPath: string;
  maxConcurrency: number;
  abortController: AbortController;
  isRunning: boolean;
}

interface PendingApproval {
  resolve: (result: { approved: boolean; editedPlan?: string; feedback?: string }) => void;
  reject: (error: Error) => void;
  featureId: string;
  projectPath: string;
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
}

/**
 * Execution state for recovery after server restart
 * Tracks which features were running and auto-loop configuration
 */
interface ExecutionState {
  version: 1;
  autoLoopWasRunning: boolean;
  maxConcurrency: number;
  projectPath: string;
  branchName: string | null; // null = main worktree
  runningFeatureIds: string[];
  savedAt: string;
}

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

// Constants for consecutive failure tracking
const CONSECUTIVE_FAILURE_THRESHOLD = 2; // Pause after 2 consecutive failures (circuit breaker)
const FAILURE_WINDOW_MS = 60000; // Failures within 1 minute count as consecutive
const COOLDOWN_PERIOD_MS = 300000; // 5 minutes cooldown before auto-resume

export class AutoModeService {
  private events: EventEmitter;
  private runningFeatures = new Map<string, RunningFeature>();
  private autoLoop: AutoLoopState | null = null;
  private featureLoader = new FeatureLoader();
  // Per-project autoloop state (supports multiple concurrent projects)
  private autoLoopsByProject = new Map<string, ProjectAutoLoopState>();
  // Legacy single-project properties (kept for backward compatibility during transition)
  private autoLoopRunning = false;
  private autoLoopAbortController: AbortController | null = null;
  private config: AutoModeConfig | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  // Track retry timers so they can be cancelled on shutdown
  private retryTimers = new Map<string, NodeJS.Timeout>();
  private settingsService: SettingsService | null = null;
  // Track consecutive failures to detect quota/API issues (legacy global, now per-project in autoLoopsByProject)
  private consecutiveFailures: { timestamp: number; error: string }[] = [];
  private pausedDueToFailures = false;
  // Track if idle event has been emitted (legacy, now per-project in autoLoopsByProject)
  private hasEmittedIdleEvent = false;
  // Recovery service for automatic failure recovery
  private recoveryService: RecoveryService;
  // Authority service for policy-gated feature mutations (optional)
  private authorityService: AuthorityService | null = null;
  // Data integrity watchdog service for monitoring feature count (optional)
  private integrityWatchdogService: DataIntegrityWatchdogService | null = null;
  // Lead Engineer service for delegated feature execution (optional)
  private leadEngineerService: LeadEngineerService | null = null;
  // Knowledge Store service for learning deduplication (optional)
  private knowledgeStoreService: KnowledgeStoreService | null = null;
  // Rate-limiting for auto_mode_progress events (per feature)
  private lastProgressEventTime = new Map<string, number>();
  private readonly PROGRESS_EVENT_MIN_INTERVAL_MS = 100; // Max 1 event per 100ms per feature
  // Memory management thresholds (configurable via env vars)
  private readonly HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD = parseFloat(
    process.env.HEAP_STOP_THRESHOLD || '0.8'
  ); // Default 80%
  private readonly HEAP_USAGE_ABORT_AGENTS_THRESHOLD = parseFloat(
    process.env.HEAP_ABORT_THRESHOLD || '0.9'
  ); // Default 90%

  constructor(events: EventEmitter, settingsService?: SettingsService) {
    this.events = events;
    this.settingsService = settingsService ?? null;
    this.recoveryService = getRecoveryService(events);

    // Stop running agents when their feature reaches a terminal state.
    // This prevents zombie agents from continuing to run (and consume API budget)
    // after a feature is marked done/verified externally (MCP, manual update, epic merge).
    this.events.subscribe((type, payload) => {
      if (type === 'feature:status-changed') {
        const data = payload as { featureId?: string; newStatus?: string };
        if (data.featureId && (data.newStatus === 'done' || data.newStatus === 'verified')) {
          if (this.runningFeatures.has(data.featureId)) {
            logger.info(
              `Stopping agent for completed feature ${data.featureId} (→ ${data.newStatus})`
            );
            void this.stopFeature(data.featureId);
          }
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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (!projectState) {
      // Fall back to legacy global tracking
      return this.trackFailureAndCheckPause(errorInfo);
    }

    const now = Date.now();

    // Add this failure
    projectState.consecutiveFailures.push({ timestamp: now, error: errorInfo.message });

    // Remove old failures outside the window
    projectState.consecutiveFailures = projectState.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );

    // Check if we've hit the threshold
    if (projectState.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD) {
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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (!projectState) {
      // Fall back to legacy global pause
      this.signalShouldPause(errorInfo);
      return;
    }

    if (projectState.pausedDueToFailures) {
      return; // Already paused
    }

    projectState.pausedDueToFailures = true;
    const failureCount = projectState.consecutiveFailures.length;
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

    // Stop the auto loop for this project
    this.stopAutoLoopForProject(projectPath, branchName);

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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (!projectState || !projectState.pausedDueToFailures) {
      return; // No longer paused or doesn't exist
    }

    logger.info(`Auto-resuming auto loop for ${projectPath} after cooldown period`);

    // Reset failure tracking
    projectState.pausedDueToFailures = false;
    projectState.consecutiveFailures = [];
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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (projectState) {
      projectState.consecutiveFailures = [];
      projectState.pausedDueToFailures = false;
    }
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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (projectState) {
      projectState.consecutiveFailures = [];
    }
  }

  /**
   * Record a successful feature completion to reset consecutive failure count - legacy global
   */
  private recordSuccess(): void {
    this.consecutiveFailures = [];
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

    const resolvedMaxConcurrency = await this.resolveMaxConcurrency(
      projectPath,
      branchName,
      maxConcurrency
    );

    // Use worktree-scoped key
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);

    // ATOMIC CHECK-AND-SET: Check if this project/worktree already has an active autoloop
    // and immediately reserve the slot to prevent race conditions
    const existingState = this.autoLoopsByProject.get(worktreeKey);
    if (existingState?.isRunning) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      throw new Error(
        `Auto mode is already running for ${worktreeDesc} in project: ${projectPath}`
      );
    }

    // Create new project/worktree autoloop state
    const abortController = new AbortController();
    const config: AutoModeConfig = {
      maxConcurrency: resolvedMaxConcurrency,
      useWorktrees: true,
      projectPath,
      branchName,
    };

    const projectState: ProjectAutoLoopState = {
      abortController,
      config,
      isRunning: true,
      consecutiveFailures: [],
      pausedDueToFailures: false,
      hasEmittedIdleEvent: false,
      branchName,
      cooldownTimer: null,
      startingFeatures: new Set(),
    };

    // CRITICAL: Set state immediately BEFORE any async operations to prevent TOCTOU race
    // This ensures that concurrent calls will see isRunning=true and fail the check above
    this.autoLoopsByProject.set(worktreeKey, projectState);

    const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';

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

      // Run the loop in the background
      this.runAutoLoopForProject(worktreeKey).catch((error) => {
        const worktreeDescErr = branchName ? `worktree ${branchName}` : 'main worktree';
        logger.error(`Loop error for ${worktreeDescErr} in ${projectPath}:`, error);
        const errorInfo = classifyError(error);
        this.emitAutoModeEvent('auto_mode_error', {
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
          branchName,
        });
      });

      return resolvedMaxConcurrency;
    } catch (error) {
      // If initialization fails, clean up the state we just set
      this.autoLoopsByProject.delete(worktreeKey);
      throw error;
    }
  }

  /**
   * Run the auto loop for a specific project/worktree
   * @param worktreeKey - The worktree key (projectPath::branchName or projectPath::__main__)
   */
  private async runAutoLoopForProject(worktreeKey: string): Promise<void> {
    const projectState = this.autoLoopsByProject.get(worktreeKey);
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
                'escalation:signal-received' as import('@protolabs-ai/types').EventType,
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
          await this.sleep(5000);
          continue;
        }

        // Load pending features for this project/worktree
        const pendingFeatures = await this.loadPendingFeatures(projectPath, branchName);

        logger.info(
          `[AutoLoop] Iteration ${iterationCount}: Found ${pendingFeatures.length} pending features, ${projectRunningCount}/${projectState.config.maxConcurrency} running for ${worktreeDesc}`
        );

        if (pendingFeatures.length === 0) {
          // Emit idle event only once when backlog is empty AND no features are running
          if (projectRunningCount === 0 && !projectState.hasEmittedIdleEvent) {
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
          } else if (projectState.hasEmittedIdleEvent) {
            // Still idle — keep polling at reduced frequency so we pick up
            // features that become unblocked when dependencies complete.
            logger.debug(`[AutoLoop] Still idle for ${worktreeDesc}, polling again in 30s...`);
          }
          // Longer sleep when idle to reduce filesystem reads; pass abort signal
          // so stopAutoLoopForProject() remains responsive even during 30s idle sleep
          await this.sleep(
            projectState.hasEmittedIdleEvent ? 30000 : 10000,
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

          // Start feature execution in background
          // Delegate to Lead Engineer if available, otherwise use legacy executeFeature
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
            });

          // Brief sleep to ensure proper sequencing
          await this.sleep(100);
        } else {
          logger.debug(`[AutoLoop] All pending features are already running or being started`);
        }

        await this.sleep(2000);
      } catch (error) {
        logger.error(`[AutoLoop] Loop iteration error for ${projectPath}:`, error);
        await this.sleep(5000);
      }
    }

    // Mark as not running when loop exits
    projectState.isRunning = false;
    logger.info(
      `[AutoLoop] Loop stopped for project: ${projectPath} after ${iterationCount} iterations`
    );
  }

  /**
   * Get count of running features for a specific project
   */
  private getRunningCountForProject(projectPath: string): number {
    let count = 0;
    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of running features for a specific worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree (features without branchName or matching primary branch)
   */
  private async getRunningCountForWorktree(
    projectPath: string,
    branchName: string | null
  ): Promise<number> {
    let count = 0;
    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath !== projectPath) continue;

      if (branchName === null) {
        // Main worktree auto-loop: count ALL running features for this project.
        // Features start with branchName null but get assigned feature-specific branches
        // (e.g., feature/concurrency-auto-mode-lane) when their worktree is created.
        // The old logic only matched null/primary-branch, missing all features that had
        // migrated to their own worktrees - causing the count to return 0 when 9+ agents
        // were actually running, which broke concurrency enforcement.
        count++;
      } else {
        // Feature worktree: exact match
        const featureBranch = feature.branchName ?? null;
        if (featureBranch === branchName) {
          count++;
        }
      }
    }
    return count;
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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (!projectState) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.warn(`No auto loop running for ${worktreeDesc} in project: ${projectPath}`);
      return 0;
    }

    const wasRunning = projectState.isRunning;
    projectState.isRunning = false;
    projectState.abortController.abort();

    // Clear cooldown timer if active
    if (projectState.cooldownTimer) {
      clearTimeout(projectState.cooldownTimer);
      projectState.cooldownTimer = null;
    }

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

    // Remove from map
    this.autoLoopsByProject.delete(worktreeKey);

    return await this.getRunningCountForWorktree(projectPath, branchName);
  }

  /**
   * Check if auto mode is running for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  isAutoLoopRunningForProject(projectPath: string, branchName: string | null = null): boolean {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    return projectState?.isRunning ?? false;
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
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    return projectState?.config ?? null;
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
    options?: {
      continuationPrompt?: string;
      retryCount?: number;
      previousErrors?: string[];
      recoveryContext?: string;
    }
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      const existing = this.runningFeatures.get(featureId);
      const runtime = existing ? Math.floor((Date.now() - existing.startTime) / 1000) : 0;
      logger.warn(
        `Feature ${featureId} is already running (runtime: ${runtime}s). Skipping duplicate execution.`
      );
      throw new Error(
        `Feature ${featureId} is already running (${runtime}s). If this is stale, restart the server or stop the feature first.`
      );
    }

    // Add to running features immediately to prevent duplicate execution race condition
    // We'll update branchName right after loading the feature (minimizes null window)
    const abortController = new AbortController();
    const tempRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null,
      branchName: null, // Will be updated immediately after feature load
      abortController,
      isAutoMode,
      startTime: Date.now(),
      retryCount: options?.retryCount ?? 0,
      previousErrors: options?.previousErrors ?? [],
      recoveryContext: options?.recoveryContext,
    };
    this.runningFeatures.set(featureId, tempRunningFeature);

    // Save execution state when feature starts
    if (isAutoMode) {
      await this.saveExecutionState(projectPath);
    }

    // Declare feature outside try block so it's available in catch for error reporting
    let feature: Awaited<ReturnType<typeof this.loadFeature>> | null = null;

    // Execution tracking — declared outside try for catch block access
    const executionId = randomUUID();
    const executionStartedAt = new Date().toISOString();
    let startingCostUsd = 0;

    try {
      // Validate that project path is allowed using centralized validation
      validateWorkingDirectory(projectPath);

      // Load feature details and immediately update branchName
      // This minimizes the window where branchName is null
      feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Capture starting cost for execution-specific cost tracking
      startingCostUsd = feature.costUsd ?? 0;

      // Update branchName immediately after loading
      tempRunningFeature.branchName = feature.branchName ?? null;

      // Check if feature has existing context - if so, resume instead of starting fresh
      // Skip this check if we're already being called with a continuation prompt (from resumeFeature)
      if (!options?.continuationPrompt) {
        // If feature has an approved plan but we don't have a continuation prompt yet,
        // we should build one to ensure it proceeds with multi-agent execution
        if (feature.planSpec?.status === 'approved') {
          logger.info(`Feature ${featureId} has approved plan, building continuation prompt`);

          // Get customized prompts from settings
          const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
          const planContent = feature.planSpec.content || '';

          // Build continuation prompt using centralized template
          let continuationPrompt = prompts.taskExecution.continuationAfterApprovalTemplate;
          continuationPrompt = continuationPrompt.replace(/\{\{userFeedback\}\}/g, '');
          continuationPrompt = continuationPrompt.replace(/\{\{approvedPlan\}\}/g, planContent);

          // Recursively call executeFeature with the continuation prompt
          // Remove from running features temporarily, it will be added back
          this.runningFeatures.delete(featureId);
          return this.executeFeature(
            projectPath,
            featureId,
            useWorktrees,
            isAutoMode,
            providedWorktreePath,
            {
              continuationPrompt,
            }
          );
        }

        const hasExistingContext = await this.contextExists(projectPath, featureId);
        if (hasExistingContext) {
          logger.info(
            `Feature ${featureId} has existing context, resuming instead of starting fresh`
          );
          // Remove from running features temporarily, resumeFeature will add it back
          this.runningFeatures.delete(featureId);
          return this.resumeFeature(projectPath, featureId, useWorktrees);
        }
      }

      // Derive workDir from feature.branchName
      // Worktrees should already be created when the feature is added/edited
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        // Try to find existing worktree for this branch
        worktreePath = await this.findExistingWorktreeForBranch(projectPath, branchName);

        if (worktreePath) {
          logger.info(`Using existing worktree for branch "${branchName}": ${worktreePath}`);
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

      // Ensure workDir is always an absolute path for cross-platform compatibility
      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

      // Validate that working directory is allowed using centralized validation
      validateWorkingDirectory(workDir);

      // Update running feature with actual worktree info
      tempRunningFeature.worktreePath = worktreePath;

      // Authority system policy check: verify permission before starting this feature
      if (this.authorityService && this.settingsService) {
        try {
          const projectSettings = await this.settingsService.getProjectSettings(projectPath);
          if (projectSettings.authoritySystem?.enabled) {
            const proposal: ActionProposal = {
              who: 'auto-mode',
              what: 'transition_status',
              target: featureId,
              justification: `Auto-mode starting feature: ${feature.title || featureId}`,
              risk: 'low',
              statusTransition: { from: feature.status || 'backlog', to: 'in_progress' },
            };

            const decision = await this.authorityService.submitProposal(proposal, projectPath);
            if (decision.verdict !== 'allow') {
              logger.info(`Authority denied feature start: ${decision.reason}`);
              this.runningFeatures.delete(featureId);
              this.emitAutoModeEvent('auto_mode_feature_skipped', {
                featureId,
                projectPath,
                reason: decision.reason,
                verdict: decision.verdict,
              });
              return;
            }
          }
        } catch (policyError) {
          // Log but proceed with execution if the policy check itself fails.
          // This prevents the authority system from becoming a single point of failure.
          logger.error('Authority policy check failed, proceeding with execution:', policyError);
        }
      }

      // Update feature status to in_progress BEFORE emitting event
      // This ensures the frontend sees the updated status when it reloads features
      await this.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Emit feature start event AFTER status update so frontend sees correct status
      this.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        branchName: feature.branchName ?? null,
        feature: {
          id: featureId,
          title: feature.title || 'Loading...',
          description: feature.description || 'Feature is starting',
        },
      });

      // Load autoLoadClaudeMd setting to determine context loading strategy
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Get customized prompts from settings
      const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

      // Build the prompt - use continuation prompt if provided (for recovery after plan approval)
      let prompt: string;
      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) and memory files
      // Context loader uses task context to select relevant memory files
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
        taskContext: {
          title: feature.title ?? '',
          description: feature.description ?? '',
        },
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      // Note: contextResult.formattedPrompt now includes both context AND memory
      const combinedSystemPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      if (options?.continuationPrompt) {
        // Continuation prompt is used when recovering from a plan approval
        // The plan was already approved, so skip the planning phase
        prompt = options.continuationPrompt;
        logger.info(`Using continuation prompt for feature ${featureId}`);
      } else {
        // Normal flow: build prompt with planning phase
        const featurePrompt = this.buildFeaturePrompt(feature, prompts.taskExecution);
        const planningPrefix = await this.getPlanningPromptPrefix(feature);
        prompt = planningPrefix + featurePrompt;

        // Add recovery context if this is a retry attempt
        if (options?.recoveryContext) {
          const recoverySection = `\n\n## Recovery Context\n\nThis is retry attempt #${options.retryCount ?? 1}. The previous attempt failed with the following context:\n\n${options.recoveryContext}\n\nPlease address these issues in your implementation.\n`;
          prompt = recoverySection + prompt;
          logger.info(
            `Added recovery context for feature ${featureId} (retry #${options.retryCount})`
          );
        }

        // Emit planning mode info
        if (feature.planningMode && feature.planningMode !== 'skip') {
          this.emitAutoModeEvent('planning_started', {
            featureId: feature.id,
            mode: feature.planningMode,
            message: `Starting ${feature.planningMode} planning phase`,
          });
        }
      }

      // Extract image paths from feature
      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === 'string' ? img : img.path
      );

      // Get model based on feature complexity and failure count
      const modelResult = await this.getModelForFeature(feature, projectPath);
      const maxTurns = getTurnsForFeature(feature);
      const provider = ProviderFactory.getProviderNameForModel(modelResult.model);
      logger.info(
        `Executing feature ${featureId} with model: ${modelResult.model}, maxTurns: ${maxTurns}, provider: ${provider} in ${workDir}`
      );

      // Store model and provider in running feature for tracking
      tempRunningFeature.model = modelResult.model;
      tempRunningFeature.provider = provider;

      // Sync and restack the branch before agent execution
      // This keeps the branch fresh and reduces merge conflicts
      if (branchName && useWorktrees) {
        logger.info(`Syncing branch ${branchName} before agent execution...`);
        this.emitAutoModeEvent('sync_started', {
          featureId,
          branchName,
          message: `Syncing branch ${branchName} with parent...`,
        });

        const syncResult = await graphiteService.syncAndRestack(workDir, branchName);

        if (syncResult.success) {
          logger.info(`Branch ${branchName} synced successfully`);
          this.emitAutoModeEvent('sync_completed', {
            featureId,
            branchName,
            message: 'Branch synchronized successfully',
          });
        } else if (syncResult.conflicts) {
          // Conflicts detected - emit warning but continue (non-blocking)
          logger.warn(`Branch ${branchName} has conflicts after sync: ${syncResult.error}`);
          this.emitAutoModeEvent('sync_warning', {
            featureId,
            branchName,
            message: `Sync encountered conflicts: ${syncResult.error}. Agent will attempt to resolve.`,
            warning: true,
          });
        } else {
          // Graphite unavailable or failed — fall back to plain git rebase
          // This is the critical path: without this, agents start on stale code
          // when dependency PRs have merged since the worktree was created
          logger.info(
            `Graphite sync unavailable for ${branchName}, falling back to git fetch + rebase`
          );
          try {
            await execAsync('git fetch origin', { cwd: workDir, timeout: 30000 });
            await execAsync('git rebase origin/main', { cwd: workDir, timeout: 60000 });
            logger.info(`Branch ${branchName} rebased onto origin/main via git fallback`);
            this.emitAutoModeEvent('sync_completed', {
              featureId,
              branchName,
              message: 'Branch rebased onto origin/main (git fallback)',
            });
          } catch (rebaseError) {
            const rebaseMsg =
              rebaseError instanceof Error ? rebaseError.message : String(rebaseError);
            // If rebase fails (conflicts), abort and let agent work on current state
            if (rebaseMsg.includes('conflict') || rebaseMsg.includes('CONFLICT')) {
              logger.warn(`Git rebase encountered conflicts for ${branchName}, aborting rebase`);
              try {
                await execAsync('git rebase --abort', { cwd: workDir, timeout: 10000 });
              } catch {
                // Abort failed — not much we can do
              }
              this.emitAutoModeEvent('sync_warning', {
                featureId,
                branchName,
                message: `Rebase conflicts detected. Agent will work on current branch state.`,
                warning: true,
              });
            } else {
              logger.warn(`Git rebase failed for ${branchName}: ${rebaseMsg}`);
              this.emitAutoModeEvent('sync_warning', {
                featureId,
                branchName,
                message: `Git rebase failed: ${rebaseMsg}. Continuing with agent execution.`,
                warning: true,
              });
            }
          }
        }
      }

      // Run the agent with the feature's model and images
      // Context files are passed as system prompt for higher priority
      // On retries, try to resume from the previous session if available
      const resumeSessionId = tempRunningFeature.retryCount > 0 ? feature.lastSessionId : undefined;
      if (resumeSessionId) {
        logger.info(
          `Resuming feature ${featureId} from session ${resumeSessionId} (retry #${tempRunningFeature.retryCount})`
        );
      }

      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        imagePaths,
        modelResult.model,
        {
          projectPath,
          planningMode: feature.planningMode,
          requirePlanApproval: feature.requirePlanApproval,
          systemPrompt: combinedSystemPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
          branchName: feature.branchName ?? null,
          maxTurns,
          resume: resumeSessionId,
          providerId: modelResult.providerId,
        }
      );

      // Check for pipeline steps and execute them
      const pipelineConfig = await pipelineService.getPipelineConfig(projectPath);
      const sortedSteps = [...(pipelineConfig?.steps || [])].sort((a, b) => a.order - b.order);

      if (sortedSteps.length > 0) {
        // Execute pipeline steps sequentially
        await this.executePipelineSteps(
          projectPath,
          featureId,
          feature,
          sortedSteps,
          workDir,
          abortController,
          autoLoadClaudeMd
        );
      }

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): go directly to 'verified' (no manual verify needed)
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';
      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.recordSuccessForProject(projectPath, feature?.branchName ?? null);

      // Capture execution record on success
      try {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - tempRunningFeature.startTime;
        const currentFeature = await this.featureLoader.get(projectPath, featureId);
        // Calculate execution-specific cost delta (not cumulative cost)
        const executionCostUsd = Math.max(0, (currentFeature?.costUsd ?? 0) - startingCostUsd);
        const record: ExecutionRecord = {
          id: executionId,
          startedAt: executionStartedAt,
          completedAt,
          durationMs,
          costUsd: executionCostUsd,
          model: modelResult.model,
          success: true,
          trigger: isAutoMode ? (tempRunningFeature.retryCount > 0 ? 'retry' : 'auto') : 'manual',
        };
        const history = currentFeature?.executionHistory ?? [];
        await this.featureLoader.update(projectPath, featureId, {
          executionHistory: [...history, record],
        });
      } catch (recordError) {
        logger.warn(`Failed to save execution record for ${featureId}:`, recordError);
      }

      // Record learnings and memory usage after successful feature completion
      try {
        const featureDir = getFeatureDir(projectPath, featureId);
        const outputPath = path.join(featureDir, 'agent-output.md');
        let agentOutput = '';
        try {
          const outputContent = await secureFs.readFile(outputPath, 'utf-8');
          agentOutput =
            typeof outputContent === 'string' ? outputContent : outputContent.toString();
        } catch {
          // Agent output might not exist yet
        }

        // Record memory usage if we loaded any memory files
        if (contextResult.memoryFiles.length > 0 && agentOutput) {
          await recordMemoryUsage(
            projectPath,
            contextResult.memoryFiles,
            agentOutput,
            true, // success
            secureFs as Parameters<typeof recordMemoryUsage>[4]
          );
        }

        // Extract and record learnings from the agent output
        await this.recordLearningsFromFeature(projectPath, feature, agentOutput);
      } catch (learningError) {
        logger.warn('Failed to record learnings:', learningError);
      }

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
          // Don't fail the feature - git workflow is best-effort
        }
      }

      const gitInfo = gitWorkflowResult?.commitHash
        ? ` | Committed: ${gitWorkflowResult.commitHash}${gitWorkflowResult.pushed ? ', pushed' : ''}${gitWorkflowResult.prUrl ? `, PR: ${gitWorkflowResult.prUrl}` : ''}`
        : '';

      const runtimeSec = tempRunningFeature
        ? Math.round((Date.now() - tempRunningFeature.startTime) / 1000)
        : 0;
      this.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message: `Feature completed in ${runtimeSec}s${finalStatus === 'verified' ? ' - auto-verified' : ''}${gitInfo}`,
        projectPath,
        model: tempRunningFeature?.model,
        provider: tempRunningFeature?.provider,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      // Capture execution record on failure (skip aborts — not real executions)
      if (!errorInfo.isAbort && tempRunningFeature.startTime) {
        try {
          const completedAt = new Date().toISOString();
          const durationMs = Date.now() - tempRunningFeature.startTime;
          const currentFeature = await this.featureLoader.get(projectPath, featureId);
          // Calculate execution-specific cost delta (not cumulative cost)
          const executionCostUsd = Math.max(0, (currentFeature?.costUsd ?? 0) - startingCostUsd);
          const record: ExecutionRecord = {
            id: executionId,
            startedAt: executionStartedAt,
            completedAt,
            durationMs,
            costUsd: executionCostUsd,
            model: tempRunningFeature.model || 'unknown',
            success: false,
            error: errorInfo.message,
            trigger: isAutoMode ? (tempRunningFeature.retryCount > 0 ? 'retry' : 'auto') : 'manual',
          };
          const history = currentFeature?.executionHistory ?? [];
          await this.featureLoader.update(projectPath, featureId, {
            executionHistory: [...history, record],
          });
        } catch (recordError) {
          logger.warn(`Failed to save execution record for ${featureId}:`, recordError);
        }
      }

      if (error instanceof LoopDetectedError && feature && tempRunningFeature) {
        // Loop detected: retry with recovery guidance
        const MAX_LOOP_RETRIES = 2;
        if (tempRunningFeature.retryCount < MAX_LOOP_RETRIES) {
          logger.warn(
            `Loop detected for ${featureId} (${error.loopSignature}). Retrying with recovery context.`
          );
          this.runningFeatures.delete(featureId);
          const currentRetryCount = tempRunningFeature.retryCount;
          const retryTimer = setTimeout(() => {
            this.retryTimers.delete(featureId);
            this.executeFeature(projectPath, featureId, useWorktrees, isAutoMode, undefined, {
              retryCount: currentRetryCount + 1,
              previousErrors: [...(tempRunningFeature.previousErrors || []), error.message],
              recoveryContext: `You were repeating the same actions in a loop (${error.loopSignature.split(':')[0]}). Try a different approach to accomplish the task.`,
            }).catch((retryErr) => {
              logger.error(`Loop recovery retry failed for ${featureId}:`, retryErr);
            });
          }, 5000);
          this.retryTimers.set(featureId, retryTimer);
        } else {
          logger.error(`Feature ${featureId} looped ${MAX_LOOP_RETRIES} times, giving up.`);
          await this.updateFeatureStatus(projectPath, featureId, 'failed');
          this.emitAutoModeEvent('auto_mode_feature_complete', {
            featureId,
            featureName: feature.title,
            branchName: feature.branchName ?? null,
            passes: false,
            message: `Feature stuck in loop after ${MAX_LOOP_RETRIES} retries`,
            projectPath,
          });
        }
      } else if (errorInfo.isAbort) {
        this.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature?.title,
          branchName: feature?.branchName ?? null,
          passes: false,
          message: 'Feature stopped by user',
          projectPath,
        });
      } else if (errorInfo.type === 'max_turns' && feature && tempRunningFeature) {
        // Special handling for error_max_turns: save progress, escalate turns, and retry with cap

        // Save uncommitted work so the retry agent picks up where this one left off
        if (tempRunningFeature.worktreePath && feature.branchName) {
          const savedHash = await gitWorkflowService.saveAgentProgress(
            tempRunningFeature.worktreePath,
            feature,
            feature.branchName
          );
          if (savedHash) {
            logger.info(
              `Saved agent progress checkpoint (${savedHash}) before max-turns retry for feature ${featureId}`
            );
          }
        }

        const MAX_MAX_TURNS_RETRIES = 3;
        const currentFailures = feature.failureCount ?? 0;
        const newFailureCount = currentFailures + 1;

        if (tempRunningFeature.retryCount >= MAX_MAX_TURNS_RETRIES) {
          logger.error(
            `Feature ${featureId} hit max turns limit ${MAX_MAX_TURNS_RETRIES} times, giving up.`
          );
          // Persist terminal status so the feature doesn't stay stuck in running/in-progress
          await this.updateFeatureStatus(projectPath, featureId, 'failed');
          await this.featureLoader.update(projectPath, featureId, {
            error: `Exceeded max-turns retry limit (${MAX_MAX_TURNS_RETRIES} retries)`,
            lastFailureTime: new Date().toISOString(),
          });
          this.emitAutoModeEvent('auto_mode_feature_complete', {
            featureId,
            featureName: feature.title,
            branchName: feature.branchName ?? null,
            passes: false,
            message: `Feature exceeded max-turns retry limit (${MAX_MAX_TURNS_RETRIES} retries)`,
            projectPath,
          });
        } else {
          const escalatedTurns = getTurnsForFeature({
            ...feature,
            failureCount: newFailureCount,
          });

          logger.warn(
            `Feature ${featureId} hit max turns limit (failure #${newFailureCount}). ` +
              `Escalating turns to ${escalatedTurns} for retry.`
          );

          await this.featureLoader.update(projectPath, featureId, {
            failureCount: newFailureCount,
          });

          this.emitAutoModeEvent('auto_mode_progress', {
            featureId,
            featureName: feature.title,
            message: `Hit turn limit. Retrying with ${escalatedTurns} turns (attempt ${newFailureCount + 1}).`,
            projectPath,
          });

          // Remove from running features and retry with escalated turns using backoff
          this.runningFeatures.delete(featureId);

          // Capture values for closure before setTimeout
          const currentRetryCount = tempRunningFeature.retryCount;
          const currentPreviousErrors = tempRunningFeature.previousErrors;
          const backoffMs = Math.min(1000 * Math.pow(2, currentRetryCount), 30_000);
          const retryTimer = setTimeout(() => {
            this.retryTimers.delete(featureId);
            this.executeFeature(
              projectPath,
              featureId,
              useWorktrees,
              isAutoMode,
              providedWorktreePath,
              {
                retryCount: currentRetryCount + 1,
                previousErrors: [...currentPreviousErrors, errorInfo.message],
              }
            ).catch((retryError) => {
              logger.error(`Max-turns retry failed for feature ${featureId}:`, retryError);
            });
          }, backoffMs);
          this.retryTimers.set(featureId, retryTimer);
          return;
        }
      } else {
        logger.error(`Feature ${featureId} failed:`, error);

        // Build execution context for recovery analysis
        const executionContext: ExecutionContext = {
          featureId,
          projectPath,
          worktreePath: tempRunningFeature?.worktreePath ?? undefined,
          retryCount: tempRunningFeature?.retryCount ?? 0,
          previousErrors: tempRunningFeature?.previousErrors ?? [],
          runningTime: tempRunningFeature ? Date.now() - tempRunningFeature.startTime : 0,
        };

        // Analyze failure and determine recovery strategy
        const failureAnalysis = await this.recoveryService.analyzeFailure(
          error,
          errorInfo,
          executionContext
        );

        // Execute recovery strategy
        const recoveryResult = await this.recoveryService.executeRecovery(
          featureId,
          failureAnalysis,
          projectPath
        );

        if (recoveryResult.shouldRetry && failureAnalysis.isRetryable && tempRunningFeature) {
          // Recovery suggests retry - schedule it with context
          logger.info(
            `Recovery for feature ${featureId}: scheduling retry (attempt ${tempRunningFeature.retryCount + 1}/${failureAnalysis.maxRetries})`
          );

          this.emitAutoModeEvent('auto_mode_progress', {
            featureId,
            featureName: feature?.title,
            message: `Recovery: ${recoveryResult.actionTaken}`,
            projectPath,
          });

          // Wait for the suggested delay before retry
          if (failureAnalysis.suggestedDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, failureAnalysis.suggestedDelay));
          }

          // Remove from running features so retry can start
          this.runningFeatures.delete(featureId);

          // Capture values for closure before setImmediate
          const currentRetryCount = tempRunningFeature.retryCount;
          const newPreviousErrors = [...tempRunningFeature.previousErrors, errorInfo.message];

          // Use setImmediate to avoid stack overflow on deep retry chains
          setImmediate(() => {
            this.executeFeature(
              projectPath,
              featureId,
              useWorktrees,
              isAutoMode,
              providedWorktreePath,
              {
                retryCount: currentRetryCount + 1,
                previousErrors: newPreviousErrors,
                recoveryContext: recoveryResult.retryContext,
              }
            ).catch((retryError) => {
              logger.error(`Retry failed for feature ${featureId}:`, retryError);
            });
          });

          // Return early - don't move to backlog or track as failure
          return;
        }

        // Recovery didn't suggest retry or not retryable - fall back to original behavior
        // Increment failure count for model escalation on retry
        if (feature) {
          const newFailureCount = (feature.failureCount ?? 0) + 1;
          await this.featureLoader.update(projectPath, featureId, {
            failureCount: newFailureCount,
          });
          logger.info(`Feature ${featureId} failure count: ${newFailureCount}`);
        }
        await this.updateFeatureStatus(projectPath, featureId, 'backlog');
        this.emitAutoModeEvent('auto_mode_error', {
          featureId,
          featureName: feature?.title,
          branchName: feature?.branchName ?? null,
          error: errorInfo.message,
          errorType: errorInfo.type,
          projectPath,
          recoveryAttempted: true,
          recoveryAction: recoveryResult.actionTaken,
          failureCategory: failureAnalysis.category,
        });

        // Track this failure and check if we should pause auto mode
        // This handles both specific quota/rate limit errors AND generic failures
        // that may indicate quota exhaustion (SDK doesn't always return useful errors)
        const featureBranch = feature?.branchName ?? null;
        const shouldPause = this.trackFailureAndCheckPauseForProject(projectPath, featureBranch, {
          type: errorInfo.type,
          message: errorInfo.message,
        });

        if (shouldPause) {
          this.signalShouldPauseForProject(projectPath, featureBranch, {
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      logger.info(`Feature ${featureId} execution ended, cleaning up runningFeatures`);
      logger.info(
        `Pending approvals at cleanup: ${Array.from(this.pendingApprovals.keys()).join(', ') || 'none'}`
      );
      abortController?.abort();

      // Only delete if the current entry is still the one we created
      // (delegated executions may have created a new entry)
      const current = this.runningFeatures.get(featureId);
      if (current === tempRunningFeature) {
        this.runningFeatures.delete(featureId);
      }

      // Update execution state after feature completes
      if (this.autoLoopRunning && projectPath) {
        await this.saveExecutionState(projectPath);
      }
    }
  }

  /**
   * Execute pipeline steps sequentially after initial feature implementation
   */
  private async executePipelineSteps(
    projectPath: string,
    featureId: string,
    feature: Feature,
    steps: PipelineStep[],
    workDir: string,
    abortController: AbortController,
    autoLoadClaudeMd: boolean
  ): Promise<void> {
    logger.info(`Executing ${steps.length} pipeline step(s) for feature ${featureId}`);

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Load context files once with feature context for smart memory selection
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      taskContext: {
        title: feature.title ?? '',
        description: feature.description ?? '',
      },
    });
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Load previous agent output for context continuity
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const pipelineStatus = `pipeline_${step.id}`;

      // Update feature status to current pipeline step
      await this.updateFeatureStatus(projectPath, featureId, pipelineStatus);

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        branchName: feature.branchName ?? null,
        content: `Starting pipeline step ${i + 1}/${steps.length}: ${step.name}`,
        projectPath,
      });

      this.emitAutoModeEvent('pipeline_step_started', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });

      // Build prompt for this pipeline step
      const prompt = this.buildPipelineStepPrompt(
        step,
        feature,
        previousContext,
        prompts.taskExecution
      );

      // Get model based on feature complexity and failure count
      const modelResult = await this.getModelForFeature(feature, projectPath);

      // Run the agent for this pipeline step
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        undefined, // no images for pipeline steps
        modelResult.model,
        {
          projectPath,
          planningMode: 'skip', // Pipeline steps don't need planning
          requirePlanApproval: false,
          previousContent: previousContext,
          systemPrompt: contextFilesPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
          providerId: modelResult.providerId,
        }
      );

      // Load updated context for next step
      try {
        previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
      } catch {
        // No context update
      }

      this.emitAutoModeEvent('pipeline_step_complete', {
        featureId,
        stepId: step.id,
        stepName: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        projectPath,
      });

      logger.info(
        `Pipeline step ${i + 1}/${steps.length} (${step.name}) completed for feature ${featureId}`
      );
    }

    logger.info(`All pipeline steps completed for feature ${featureId}`);
  }

  /**
   * Build the prompt for a pipeline step
   */
  private buildPipelineStepPrompt(
    step: PipelineStep,
    feature: Feature,
    previousContext: string,
    taskExecutionPrompts: {
      implementationInstructions: string;
      playwrightVerificationInstructions: string;
    }
  ): string {
    let prompt = `## Pipeline Step: ${step.name}

This is an automated pipeline step following the initial feature implementation.

### Feature Context
${this.buildFeaturePrompt(feature, taskExecutionPrompts)}

`;

    if (previousContext) {
      prompt += `### Previous Work
The following is the output from the previous work on this feature:

${previousContext}

`;
    }

    prompt += `### Pipeline Step Instructions
${step.instructions}

### Task
Complete the pipeline step instructions above. Review the previous work and apply the required changes or actions.`;

    return prompt;
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
    this.runningFeatures.delete(featureId);

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
    for (const projectState of this.autoLoopsByProject.values()) {
      projectState.startingFeatures.delete(featureId);
    }
  }

  /**
   * Graceful shutdown: stop all auto-loops and abort all running features.
   * Called during SIGTERM/SIGINT to prevent orphaned agent processes.
   */
  async shutdown(): Promise<void> {
    logger.info(
      `[Shutdown] Stopping ${this.autoLoopsByProject.size} auto-loops and ${this.runningFeatures.size} running features`
    );

    // Mark all running features as interrupted BEFORE aborting agents
    await this.markAllRunningFeaturesInterrupted('server shutdown');

    // Stop all per-project auto-loops
    for (const [key, projectState] of this.autoLoopsByProject) {
      projectState.isRunning = false;
      projectState.abortController.abort();
      if (projectState.cooldownTimer) {
        clearTimeout(projectState.cooldownTimer);
      }
      // Clear starting features to prevent leaks
      projectState.startingFeatures.clear();
      logger.info(`[Shutdown] Stopped auto-loop: ${key}`);
    }
    this.autoLoopsByProject.clear();

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

      await this.updateFeatureStatus(projectPath, featureId, finalStatus);

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
    this.runningFeatures.set(featureId, pipelineRunningFeature);

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
      await this.executePipelineSteps(
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
        this.runningFeatures.delete(featureId);
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
    this.runningFeatures.set(featureId, followUpRunningFeature);

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
      await this.runAgent(
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
        this.runningFeatures.delete(featureId);
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
   * Check if context exists for a feature
   */
  async contextExists(projectPath: string, featureId: string): Promise<boolean> {
    // Context is stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');

    try {
      await secureFs.access(contextPath);
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
  } {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
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
    };
  }

  /**
   * Get all active auto loop worktrees with their project paths and branch names
   */
  getActiveAutoLoopWorktrees(): Array<{ projectPath: string; branchName: string | null }> {
    const activeWorktrees: Array<{ projectPath: string; branchName: string | null }> = [];
    for (const [, state] of this.autoLoopsByProject) {
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
    for (const [, state] of this.autoLoopsByProject) {
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
   * Attempt to restack the worktree using Graphite to sync with main/trunk
   * This helps prevent merge conflicts by keeping the branch up to date
   *
   * @param worktreePath - Path to the worktree
   * @param branchName - Name of the branch being worked on
   * @returns true if restack succeeded or wasn't needed, false if conflicts occurred
   */
  private async attemptGraphiteRestack(worktreePath: string, branchName: string): Promise<boolean> {
    try {
      // Check if Graphite should be used
      const settings = await this.settingsService?.getGlobalSettings();
      const useGraphite = await graphiteService.shouldUseGraphite(settings?.graphite);

      if (!useGraphite) {
        logger.debug('Graphite not enabled, skipping restack');
        return true; // Not an error, just not using Graphite
      }

      // Check if repo is initialized for Graphite
      const initialized = await graphiteService.isRepoInitialized(worktreePath);
      if (!initialized) {
        logger.debug('Graphite not initialized for this repo, skipping restack');
        return true; // Not an error, just not initialized
      }

      // Perform restack to sync with trunk
      logger.info(`Restacking branch "${branchName}" to sync with trunk`);
      const result = await graphiteService.restack(worktreePath);

      if (result.conflicts) {
        logger.warn(
          `Restack encountered conflicts for branch "${branchName}". Manual resolution required.`
        );
        return false; // Conflicts need manual resolution
      }

      if (!result.success) {
        logger.warn(`Restack failed for branch "${branchName}": ${result.error}`);
        // Non-conflict failures are logged but don't block execution
        return true;
      }

      logger.info(`Successfully restacked branch "${branchName}"`);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Error attempting Graphite restack for "${branchName}": ${errorMsg}`);
      // Don't block execution on restack errors
      return true;
    }
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
        // Create new branch from HEAD
        await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" HEAD`, {
          cwd: projectPath,
          env: gitEnv,
        });
      }

      logger.info(`Created worktree for branch "${branchName}" at: ${worktreePath}`);

      // Track branch in Graphite if feature has an epic parent
      if (feature && this.settingsService) {
        const settings = await this.settingsService.getGlobalSettings();
        const shouldUse = await graphiteService.shouldUseGraphite(settings.graphite);

        if (shouldUse) {
          let parentBranch: string | undefined;

          // If feature belongs to an epic, track against epic branch
          if (feature.epicId && !feature.isEpic) {
            const epicFeature = await this.featureLoader.get(projectPath, feature.epicId);
            parentBranch = epicFeature?.branchName;
            if (parentBranch) {
              logger.info(
                `Feature ${feature.id} belongs to epic, tracking branch ${branchName} with parent ${parentBranch}`
              );
            }
          }

          // Track the branch (with parent if epic, otherwise trunk)
          const tracked = await graphiteService.trackBranch(worktreePath, branchName, parentBranch);
          if (tracked) {
            logger.info(
              `Successfully tracked branch ${branchName} in Graphite${parentBranch ? ` with parent ${parentBranch}` : ''}`
            );
          } else {
            logger.warn(`Failed to track branch ${branchName} in Graphite, will use fallback`);
          }
        }
      }

      // Attempt to restack with Graphite to sync with trunk
      const restackSuccess = await this.attemptGraphiteRestack(worktreePath, branchName);
      if (!restackSuccess) {
        logger.warn(
          `Branch "${branchName}" has merge conflicts after restack. Agent may encounter issues.`
        );
        // Note: We don't fail worktree creation, but log the warning
        // The agent will discover conflicts when it tries to commit
      }

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
    // Features are stored in .automaker directory
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

      feature.status = status;
      feature.updatedAt = new Date().toISOString();
      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === 'waiting_approval') {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      }
      // Set lastFailureTime when feature fails (for auto-retry cooldown)
      if (status === 'failed' || status === 'blocked') {
        feature.lastFailureTime = new Date().toISOString();
      }

      // Use atomic write with backup support
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Create notifications for important status changes
      const notificationService = getNotificationService();
      if (status === 'waiting_approval') {
        await notificationService.createNotification({
          type: 'feature_waiting_approval',
          title: 'Feature Ready for Review',
          message: `"${feature.title || featureId}" is ready for your review and approval.`,
          featureId,
          projectPath,
        });
      } else if (status === 'verified') {
        await notificationService.createNotification({
          type: 'feature_verified',
          title: 'Feature Verified',
          message: `"${feature.title || featureId}" has been verified and is complete.`,
          featureId,
          projectPath,
        });
      }

      // Sync completed/verified features to app_spec.txt
      if (status === 'verified' || status === 'completed') {
        try {
          await this.featureLoader.syncFeatureToAppSpec(projectPath, feature);
        } catch (syncError) {
          // Log but don't fail the status update if sync fails
          logger.warn(`Failed to sync feature ${featureId} to app_spec.txt:`, syncError);
        }
      }
    } catch (error) {
      logger.error(`Failed to update feature status for ${featureId}:`, error);
    }
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

      // ── Dependency re-evaluation: unblock features whose deps are now satisfied ──
      // Features can be set to 'blocked' when their dependencies aren't ready.
      // When those deps complete, we need to automatically move them back to 'backlog'.
      const blockedWithDeps = allFeatures.filter(
        (f) => f.status === 'blocked' && f.dependencies && f.dependencies.length > 0
      );

      for (const feature of blockedWithDeps) {
        const satisfied = areDependenciesSatisfied(feature, allFeatures);
        if (satisfied) {
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
                dep.status !== 'completed' &&
                dep.status !== 'verified' &&
                dep.status !== 'done' &&
                dep.status !== 'review'
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

  /**
   * Get the planning prompt prefix based on feature's planning mode
   */
  private async getPlanningPromptPrefix(feature: Feature): Promise<string> {
    const mode = feature.planningMode || 'skip';

    if (mode === 'skip') {
      return ''; // No planning phase
    }

    // Load prompts from settings (no caching - allows hot reload of custom prompts)
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    const planningPrompts: Record<string, string> = {
      lite: prompts.autoMode.planningLite,
      lite_with_approval: prompts.autoMode.planningLiteWithApproval,
      spec: prompts.autoMode.planningSpec,
      full: prompts.autoMode.planningFull,
    };

    // For lite mode, use the approval variant if requirePlanApproval is true
    let promptKey: string = mode;
    if (mode === 'lite' && feature.requirePlanApproval === true) {
      promptKey = 'lite_with_approval';
    }

    const planningPrompt = planningPrompts[promptKey];
    if (!planningPrompt) {
      return '';
    }

    return planningPrompt + '\n\n---\n\n## Feature Request\n\n';
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

  private async runAgent(
    workDir: string,
    featureId: string,
    prompt: string,
    abortController: AbortController,
    projectPath: string,
    imagePaths?: string[],
    model?: string,
    options?: {
      projectPath?: string;
      planningMode?: PlanningMode;
      requirePlanApproval?: boolean;
      previousContent?: string;
      systemPrompt?: string;
      autoLoadClaudeMd?: boolean;
      thinkingLevel?: ThinkingLevel;
      branchName?: string | null;
      maxTurns?: number;
      resume?: string;
      /** Provider ID from PhaseModelEntry for explicit provider lookup */
      providerId?: string;
    }
  ): Promise<void> {
    const finalProjectPath = options?.projectPath || projectPath;
    const branchName = options?.branchName ?? null;
    const planningMode = options?.planningMode || 'skip';
    const previousContent = options?.previousContent;

    // Validate vision support before processing images
    const effectiveModel = model || 'claude-sonnet-4-20250514';
    if (imagePaths && imagePaths.length > 0) {
      const supportsVision = ProviderFactory.modelSupportsVision(effectiveModel);
      if (!supportsVision) {
        throw new Error(
          `This model (${effectiveModel}) does not support image input. ` +
            `Please switch to a model that supports vision (like Claude models), or remove the images and try again.`
        );
      }
    }

    // Check if this planning mode can generate a spec/plan that needs approval
    // - spec and full always generate specs
    // - lite only generates approval-ready content when requirePlanApproval is true
    const planningModeRequiresApproval =
      planningMode === 'spec' ||
      planningMode === 'full' ||
      (planningMode === 'lite' && options?.requirePlanApproval === true);
    const requiresApproval = planningModeRequiresApproval && options?.requirePlanApproval === true;

    // CI/CD Mock Mode: Return early with mock response when AUTOMAKER_MOCK_AGENT is set
    // This prevents actual API calls during automated testing
    if (process.env.AUTOMAKER_MOCK_AGENT === 'true') {
      logger.info(`MOCK MODE: Skipping real agent execution for feature ${featureId}`);

      // Simulate some work being done
      await this.sleep(500);

      // Emit mock progress events to simulate agent activity
      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Analyzing the codebase...',
      });

      await this.sleep(300);

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Implementing the feature...',
      });

      await this.sleep(300);

      // Create a mock file with "yellow" content as requested in the test
      const mockFilePath = path.join(workDir, 'yellow.txt');
      await secureFs.writeFile(mockFilePath, 'yellow');

      this.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: "Mock agent: Created yellow.txt file with content 'yellow'",
      });

      await this.sleep(200);

      // Save mock agent output
      const featureDirForOutput = getFeatureDir(projectPath, featureId);
      const outputPath = path.join(featureDirForOutput, 'agent-output.md');

      const mockOutput = `# Mock Agent Output

## Summary
This is a mock agent response for CI/CD testing.

## Changes Made
- Created \`yellow.txt\` with content "yellow"

## Notes
This mock response was generated because AUTOMAKER_MOCK_AGENT=true was set.
`;

      await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
      await secureFs.writeFile(outputPath, mockOutput);

      logger.info(`MOCK MODE: Completed mock execution for feature ${featureId}`);
      return;
    }

    // Load autoLoadClaudeMd setting (project setting takes precedence over global)
    // Use provided value if available, otherwise load from settings
    const autoLoadClaudeMd =
      options?.autoLoadClaudeMd !== undefined
        ? options.autoLoadClaudeMd
        : await getAutoLoadClaudeMdSetting(finalProjectPath, this.settingsService, '[AutoMode]');

    // Load MCP servers from settings (global setting only)
    const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AutoMode]');

    // Load MCP permission settings (global setting only)

    // Build SDK options using centralized configuration for feature implementation
    const sdkOptions = createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
      autoLoadClaudeMd,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      thinkingLevel: options?.thinkingLevel,
      maxTurns: options?.maxTurns,
      resume: options?.resume,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    logger.info(
      `runAgent called for feature ${featureId} with model: ${finalModel}, planningMode: ${planningMode}, requiresApproval: ${requiresApproval}`
    );

    // Get provider for this model
    const provider = ProviderFactory.getProviderForModel(finalModel);

    // Strip provider prefix - providers should receive bare model IDs
    const bareModel = stripProviderPrefix(finalModel);

    logger.info(
      `Using provider "${provider.getName()}" for model "${finalModel}" (bare: ${bareModel})`
    );

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    // Debug: Log if system prompt is provided
    if (options?.systemPrompt) {
      logger.info(
        `System prompt provided (${options.systemPrompt.length} chars), first 200 chars:\n${options.systemPrompt.substring(0, 200)}...`
      );
    }

    // Get credentials for API calls (model comes from request, no phase model)
    const credentials = await this.settingsService?.getCredentials();

    // Try to find a provider for the model (if it's a provider model like "GLM-4.7")
    // This allows users to select provider models in the Auto Mode / Feature execution
    let claudeCompatibleProvider:
      | import('@protolabs-ai/types').ClaudeCompatibleProvider
      | undefined;
    let providerResolvedModel: string | undefined;
    if (finalModel && this.settingsService) {
      // If providerId is explicitly set (from agentExecutionModel phase setting),
      // look up the provider directly instead of scanning by model string
      if (options?.providerId) {
        const globalSettings = await this.settingsService.getGlobalSettings();
        const directProvider = globalSettings.claudeCompatibleProviders?.find(
          (p) => p.id === options.providerId && p.enabled !== false
        );
        if (directProvider) {
          claudeCompatibleProvider = directProvider;
          const modelConfig = directProvider.models?.find(
            (m) => m.id === finalModel || m.id.toLowerCase() === finalModel.toLowerCase()
          );
          if (modelConfig?.mapsToClaudeModel) {
            providerResolvedModel = resolveModelString(modelConfig.mapsToClaudeModel);
          }
          logger.info(
            `[AutoMode] Using explicit provider "${directProvider.name}" (id: ${options.providerId}) for model "${finalModel}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }

      // Fallback: scan all providers by model ID
      if (!claudeCompatibleProvider) {
        const providerResult = await getProviderByModelId(
          finalModel,
          this.settingsService,
          '[AutoMode]'
        );
        if (providerResult.provider) {
          claudeCompatibleProvider = providerResult.provider;
          providerResolvedModel = providerResult.resolvedModel;
          logger.info(
            `[AutoMode] Using provider "${providerResult.provider.name}" for model "${finalModel}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }
    }

    // Use the resolved model if available (from mapsToClaudeModel), otherwise use bareModel
    const effectiveBareModel = providerResolvedModel
      ? stripProviderPrefix(providerResolvedModel)
      : bareModel;

    const executeOptions: ExecuteOptions = {
      prompt: promptContent,
      model: effectiveBareModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
      systemPrompt: sdkOptions.systemPrompt,
      settingSources: sdkOptions.settingSources,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
      thinkingLevel: options?.thinkingLevel, // Pass thinking level for extended thinking
      credentials, // Pass credentials for resolving 'credentials' apiKeySource
      claudeCompatibleProvider, // Pass provider for alternative endpoint configuration (GLM, MiniMax, etc.)
      sdkSessionId: options?.resume, // Forward resume session ID for session continuity
    };

    // Execute via provider
    logger.info(`Starting stream for feature ${featureId}...`);
    const stream = provider.executeQuery(executeOptions);
    logger.info(`Stream created, starting to iterate...`);
    // Initialize with previous content if this is a follow-up, with a separator
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : '';
    let specDetected = false;

    // Agent output goes to .automaker directory
    // Note: We use projectPath here, not workDir, because workDir might be a worktree path
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, 'agent-output.md');
    const rawOutputPath = path.join(featureDirForOutput, 'raw-output.jsonl');

    // Raw output logging is configurable via environment variable
    // Set AUTOMAKER_DEBUG_RAW_OUTPUT=true to enable raw stream event logging
    const enableRawOutput =
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === 'true' ||
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === '1';

    // Incremental file writing state
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;
    const WRITE_DEBOUNCE_MS = 500; // Batch writes every 500ms
    const RESPONSE_TEXT_MAX_SIZE = 5 * 1024 * 1024; // 5MB threshold for responseText
    let responseTextFlushedToFile = false; // Track if we've hit the threshold

    // Raw output accumulator for debugging (NDJSON format)
    let rawOutputLines: string[] = [];
    let rawWriteTimeout: ReturnType<typeof setTimeout> | null = null;

    // Helper to append raw stream event for debugging (only when enabled)
    const appendRawEvent = (event: unknown): void => {
      if (!enableRawOutput) return;

      try {
        const timestamp = new Date().toISOString();
        const rawLine = JSON.stringify({ timestamp, event }, null, 4); // Pretty print for readability
        rawOutputLines.push(rawLine);

        // Debounced write of raw output
        if (rawWriteTimeout) {
          clearTimeout(rawWriteTimeout);
        }
        rawWriteTimeout = setTimeout(async () => {
          try {
            await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
            await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
            rawOutputLines = []; // Clear after writing
          } catch (error) {
            logger.error(`Failed to write raw output for ${featureId}:`, error);
          }
        }, WRITE_DEBOUNCE_MS);
      } catch {
        // Ignore serialization errors
      }
    };

    // Helper to write current responseText to file
    const writeToFile = async (): Promise<void> => {
      try {
        await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
        await secureFs.writeFile(outputPath, responseText);
      } catch (error) {
        // Log but don't crash - file write errors shouldn't stop execution
        logger.error(`Failed to write agent output for ${featureId}:`, error);
      }
    };

    // Debounced write - schedules a write after WRITE_DEBOUNCE_MS
    const scheduleWrite = (): void => {
      if (writeTimeout) {
        clearTimeout(writeTimeout);
      }
      writeTimeout = setTimeout(() => {
        writeToFile();
      }, WRITE_DEBOUNCE_MS);
    };

    // Heartbeat logging so "silent" model calls are visible.
    // Some runs can take a while before the first streamed message arrives.
    const streamStartTime = Date.now();
    let receivedAnyStreamMessage = false;
    const STREAM_HEARTBEAT_MS = 15_000;
    const streamHeartbeat = setInterval(() => {
      if (receivedAnyStreamMessage) return;
      const elapsedSeconds = Math.round((Date.now() - streamStartTime) / 1000);
      logger.info(
        `Waiting for first model response for feature ${featureId} (${elapsedSeconds}s elapsed)...`
      );
    }, STREAM_HEARTBEAT_MS);

    // Memory monitoring heartbeat - check heap usage every 30 seconds during execution
    const MEMORY_CHECK_MS = 30_000;
    const memoryHeartbeat = setInterval(() => {
      const heapUsage = this.getHeapUsagePercent();
      if (heapUsage >= this.HEAP_USAGE_ABORT_AGENTS_THRESHOLD) {
        logger.error(
          `[Agent ${featureId}] Critical heap usage (${Math.round(heapUsage * 100)}%), aborting agent`
        );
        abortController.abort();
      } else if (heapUsage >= this.HEAP_USAGE_STOP_NEW_AGENTS_THRESHOLD) {
        logger.warn(
          `[Agent ${featureId}] High heap usage (${Math.round(heapUsage * 100)}%) during execution`
        );
      }
    }, MEMORY_CHECK_MS);

    // Stream observer for loop and stall detection (can be disabled via workflow settings)
    const workflowSettings = await getWorkflowSettings(
      projectPath,
      this.settingsService,
      '[AutoMode]'
    );
    const loopDetectionEnabled = workflowSettings.pipeline.loopDetectionEnabled;
    const streamObserver = loopDetectionEnabled ? new StreamObserver() : null;
    let loopDetected = false;

    // Wrap stream processing in try/finally to ensure timeout cleanup on any error/abort
    try {
      streamLoop: for await (const msg of stream) {
        receivedAnyStreamMessage = true;
        // Log raw stream event for debugging
        appendRawEvent(msg);

        logger.info(`Stream message received:`, msg.type, msg.subtype || '');
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              const newText = block.text || '';

              // Skip empty text
              if (!newText) continue;

              // Feed text to stream observer for stall detection (if enabled)
              streamObserver?.onTextChunk(newText);

              // Note: Cursor-specific dedup (duplicate blocks, accumulated text) is now
              // handled in CursorProvider.deduplicateTextBlocks() for cleaner separation

              // Only add separator when we're at a natural paragraph break:
              // - Previous text ends with sentence terminator AND new text starts a new thought
              // - Don't add separators mid-word or mid-sentence (for streaming providers like Cursor)
              if (responseText.length > 0 && newText.length > 0) {
                const lastChar = responseText.slice(-1);
                const endsWithSentence = /[.!?:]\s*$/.test(responseText);
                const endsWithNewline = /\n\s*$/.test(responseText);
                const startsNewParagraph = /^[\n#\-*>]/.test(newText);

                // Add paragraph break only at natural boundaries
                if (
                  !endsWithNewline &&
                  (endsWithSentence || startsNewParagraph) &&
                  !/[a-zA-Z0-9]/.test(lastChar) // Not mid-word
                ) {
                  responseText += '\n\n';
                }
              }
              responseText += newText;

              // Check if responseText exceeds threshold and flush to disk
              if (
                !responseTextFlushedToFile &&
                Buffer.byteLength(responseText, 'utf8') > RESPONSE_TEXT_MAX_SIZE
              ) {
                logger.info(
                  `responseText exceeded ${RESPONSE_TEXT_MAX_SIZE / (1024 * 1024)}MB for feature ${featureId}, flushing to disk`
                );
                // Flush to disk immediately
                await writeToFile();
                // Keep only last 100KB in memory for context
                const keepSize = 100 * 1024;
                const textBuffer = Buffer.from(responseText, 'utf8');
                if (textBuffer.length > keepSize) {
                  const truncatedBuffer = textBuffer.subarray(textBuffer.length - keepSize);
                  responseText = `[...previous content flushed to disk...]\n\n${truncatedBuffer.toString('utf8')}`;
                }
                responseTextFlushedToFile = true;
              }

              // Check for authentication errors in the response
              if (
                block.text &&
                (block.text.includes('Invalid API key') ||
                  block.text.includes('authentication_failed') ||
                  block.text.includes('Fix external API key'))
              ) {
                throw new Error(
                  'Authentication failed: Invalid or expired API key. ' +
                    "Please check your ANTHROPIC_API_KEY, or run 'claude login' to re-authenticate."
                );
              }

              // Schedule incremental file write (debounced)
              scheduleWrite();

              // Check for [SPEC_GENERATED] marker in planning modes (spec or full)
              if (
                planningModeRequiresApproval &&
                !specDetected &&
                responseText.includes('[SPEC_GENERATED]')
              ) {
                specDetected = true;

                // Extract plan content (everything before the marker)
                const markerIndex = responseText.indexOf('[SPEC_GENERATED]');
                const planContent = responseText.substring(0, markerIndex).trim();

                // Parse tasks from the generated spec (for spec and full modes)
                // Use let since we may need to update this after plan revision
                let parsedTasks = parseTasksFromSpec(planContent);
                const tasksTotal = parsedTasks.length;

                logger.info(`Parsed ${tasksTotal} tasks from spec for feature ${featureId}`);
                if (parsedTasks.length > 0) {
                  logger.info(`Tasks: ${parsedTasks.map((t) => t.id).join(', ')}`);
                }

                // Update planSpec status to 'generated' and save content with parsed tasks
                await this.updateFeaturePlanSpec(projectPath, featureId, {
                  status: 'generated',
                  content: planContent,
                  version: 1,
                  generatedAt: new Date().toISOString(),
                  reviewedByUser: false,
                  tasks: parsedTasks,
                  tasksTotal,
                  tasksCompleted: 0,
                });

                let approvedPlanContent = planContent;
                let userFeedback: string | undefined;
                let currentPlanContent = planContent;
                let planVersion = 1;

                // Only pause for approval if requirePlanApproval is true
                if (requiresApproval) {
                  // ========================================
                  // PLAN REVISION LOOP
                  // Keep regenerating plan until user approves
                  // ========================================
                  let planApproved = false;

                  while (!planApproved) {
                    logger.info(
                      `Spec v${planVersion} generated for feature ${featureId}, waiting for approval`
                    );

                    // CRITICAL: Register pending approval BEFORE emitting event
                    const approvalPromise = this.waitForPlanApproval(featureId, projectPath);

                    // Emit plan_approval_required event
                    this.emitAutoModeEvent('plan_approval_required', {
                      featureId,
                      projectPath,
                      branchName,
                      planContent: currentPlanContent,
                      planningMode,
                      planVersion,
                    });

                    // Wait for user response
                    try {
                      const approvalResult = await approvalPromise;

                      if (approvalResult.approved) {
                        // User approved the plan
                        logger.info(`Plan v${planVersion} approved for feature ${featureId}`);
                        planApproved = true;

                        // If user provided edits, use the edited version
                        if (approvalResult.editedPlan) {
                          approvedPlanContent = approvalResult.editedPlan;
                          await this.updateFeaturePlanSpec(projectPath, featureId, {
                            content: approvalResult.editedPlan,
                          });
                        } else {
                          approvedPlanContent = currentPlanContent;
                        }

                        // Capture any additional feedback for implementation
                        userFeedback = approvalResult.feedback;

                        // Emit approval event
                        this.emitAutoModeEvent('plan_approved', {
                          featureId,
                          projectPath,
                          branchName,
                          hasEdits: !!approvalResult.editedPlan,
                          planVersion,
                        });
                      } else {
                        // User rejected - check if they provided feedback for revision
                        const hasFeedback =
                          approvalResult.feedback && approvalResult.feedback.trim().length > 0;
                        const hasEdits =
                          approvalResult.editedPlan && approvalResult.editedPlan.trim().length > 0;

                        if (!hasFeedback && !hasEdits) {
                          // No feedback or edits = explicit cancel
                          logger.info(
                            `Plan rejected without feedback for feature ${featureId}, cancelling`
                          );
                          throw new Error('Plan cancelled by user');
                        }

                        // User wants revisions - regenerate the plan
                        logger.info(
                          `Plan v${planVersion} rejected with feedback for feature ${featureId}, regenerating...`
                        );
                        planVersion++;

                        // Emit revision event
                        this.emitAutoModeEvent('plan_revision_requested', {
                          featureId,
                          projectPath,
                          branchName,
                          feedback: approvalResult.feedback,
                          hasEdits: !!hasEdits,
                          planVersion,
                        });

                        // Build revision prompt
                        let revisionPrompt = `The user has requested revisions to the plan/specification.

## Previous Plan (v${planVersion - 1})
${hasEdits ? approvalResult.editedPlan : currentPlanContent}

## User Feedback
${approvalResult.feedback || 'Please revise the plan based on the edits above.'}

## Instructions
Please regenerate the specification incorporating the user's feedback.
Keep the same format with the \`\`\`tasks block for task definitions.
After generating the revised spec, output:
"[SPEC_GENERATED] Please review the revised specification above."
`;

                        // Update status to regenerating
                        await this.updateFeaturePlanSpec(projectPath, featureId, {
                          status: 'generating',
                          version: planVersion,
                        });

                        // Make revision call
                        const revisionStream = provider.executeQuery({
                          prompt: revisionPrompt,
                          model: bareModel,
                          maxTurns: maxTurns || 100,
                          cwd: workDir,
                          allowedTools: allowedTools,
                          abortController,
                          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                          credentials, // Pass credentials for resolving 'credentials' apiKeySource
                          claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
                        });

                        let revisionText = '';
                        for await (const msg of revisionStream) {
                          if (msg.type === 'assistant' && msg.message?.content) {
                            for (const block of msg.message.content) {
                              if (block.type === 'text') {
                                revisionText += block.text || '';
                                this.emitAutoModeEvent('auto_mode_progress', {
                                  featureId,
                                  content: block.text,
                                });
                              }
                            }
                          } else if (msg.type === 'error') {
                            throw new Error(msg.error || 'Error during plan revision');
                          } else if (msg.type === 'result' && msg.subtype === 'success') {
                            revisionText += msg.result || '';
                          }
                        }

                        // Extract new plan content
                        const markerIndex = revisionText.indexOf('[SPEC_GENERATED]');
                        if (markerIndex > 0) {
                          currentPlanContent = revisionText.substring(0, markerIndex).trim();
                        } else {
                          currentPlanContent = revisionText.trim();
                        }

                        // Re-parse tasks from revised plan
                        const revisedTasks = parseTasksFromSpec(currentPlanContent);
                        logger.info(`Revised plan has ${revisedTasks.length} tasks`);

                        // Update planSpec with revised content
                        await this.updateFeaturePlanSpec(projectPath, featureId, {
                          status: 'generated',
                          content: currentPlanContent,
                          version: planVersion,
                          tasks: revisedTasks,
                          tasksTotal: revisedTasks.length,
                          tasksCompleted: 0,
                        });

                        // Update parsedTasks for implementation
                        parsedTasks = revisedTasks;

                        responseText += revisionText;
                      }
                    } catch (error) {
                      if ((error as Error).message.includes('cancelled')) {
                        throw error;
                      }
                      throw new Error(`Plan approval failed: ${(error as Error).message}`);
                    }
                  }
                } else {
                  // Auto-approve: requirePlanApproval is false, just continue without pausing
                  logger.info(
                    `Spec generated for feature ${featureId}, auto-approving (requirePlanApproval=false)`
                  );

                  // Emit info event for frontend
                  this.emitAutoModeEvent('plan_auto_approved', {
                    featureId,
                    projectPath,
                    branchName,
                    planContent,
                    planningMode,
                  });

                  approvedPlanContent = planContent;
                }

                // CRITICAL: After approval, we need to make a second call to continue implementation
                // The agent is waiting for "approved" - we need to send it and continue
                logger.info(
                  `Making continuation call after plan approval for feature ${featureId}`
                );

                // Update planSpec status to approved (handles both manual and auto-approval paths)
                await this.updateFeaturePlanSpec(projectPath, featureId, {
                  status: 'approved',
                  approvedAt: new Date().toISOString(),
                  reviewedByUser: requiresApproval,
                });

                // ========================================
                // MULTI-AGENT TASK EXECUTION
                // Each task gets its own focused agent call
                // ========================================

                if (parsedTasks.length > 0) {
                  logger.info(
                    `Starting multi-agent execution: ${parsedTasks.length} tasks for feature ${featureId}`
                  );

                  // Get customized prompts for task execution
                  const taskPrompts = await getPromptCustomization(
                    this.settingsService,
                    '[AutoMode]'
                  );

                  // Execute each task with a separate agent
                  for (let taskIndex = 0; taskIndex < parsedTasks.length; taskIndex++) {
                    const task = parsedTasks[taskIndex];

                    // Check for abort
                    if (abortController.signal.aborted) {
                      throw new Error('Feature execution aborted');
                    }

                    // Emit task started
                    logger.info(`Starting task ${task.id}: ${task.description}`);
                    this.emitAutoModeEvent('auto_mode_task_started', {
                      featureId,
                      projectPath,
                      branchName,
                      taskId: task.id,
                      taskDescription: task.description,
                      taskIndex,
                      tasksTotal: parsedTasks.length,
                    });

                    // Update planSpec with current task
                    await this.updateFeaturePlanSpec(projectPath, featureId, {
                      currentTaskId: task.id,
                    });

                    // Build focused prompt for this specific task
                    const taskPrompt = this.buildTaskPrompt(
                      task,
                      parsedTasks,
                      taskIndex,
                      approvedPlanContent,
                      taskPrompts.taskExecution.taskPromptTemplate,
                      userFeedback
                    );

                    // Execute task with dedicated agent
                    const taskStream = provider.executeQuery({
                      prompt: taskPrompt,
                      model: bareModel,
                      maxTurns: Math.min(maxTurns || 100, 50), // Limit turns per task
                      cwd: workDir,
                      allowedTools: allowedTools,
                      abortController,
                      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                      credentials, // Pass credentials for resolving 'credentials' apiKeySource
                      claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
                    });

                    // Process task stream
                    for await (const msg of taskStream) {
                      if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                          if (block.type === 'text') {
                            responseText += block.text || '';
                            this.emitAutoModeEvent('auto_mode_progress', {
                              featureId,
                              branchName,
                              content: block.text,
                            });
                          } else if (block.type === 'tool_use') {
                            this.emitAutoModeEvent('auto_mode_tool', {
                              featureId,
                              branchName,
                              tool: block.name,
                              input: block.input,
                            });
                          }
                        }
                      } else if (msg.type === 'error') {
                        throw new Error(msg.error || `Error during task ${task.id}`);
                      } else if (msg.type === 'result' && msg.subtype === 'success') {
                        responseText += msg.result || '';
                      }
                    }

                    // Emit task completed
                    logger.info(`Task ${task.id} completed for feature ${featureId}`);
                    this.emitAutoModeEvent('auto_mode_task_complete', {
                      featureId,
                      projectPath,
                      branchName,
                      taskId: task.id,
                      tasksCompleted: taskIndex + 1,
                      tasksTotal: parsedTasks.length,
                    });

                    // Update planSpec with progress
                    await this.updateFeaturePlanSpec(projectPath, featureId, {
                      tasksCompleted: taskIndex + 1,
                    });

                    // Check for phase completion (group tasks by phase)
                    if (task.phase) {
                      const nextTask = parsedTasks[taskIndex + 1];
                      if (!nextTask || nextTask.phase !== task.phase) {
                        // Phase changed, emit phase complete
                        const phaseMatch = task.phase.match(/Phase\s*(\d+)/i);
                        if (phaseMatch) {
                          this.emitAutoModeEvent('auto_mode_phase_complete', {
                            featureId,
                            projectPath,
                            branchName,
                            phaseNumber: parseInt(phaseMatch[1], 10),
                          });
                        }
                      }
                    }
                  }

                  logger.info(`All ${parsedTasks.length} tasks completed for feature ${featureId}`);
                } else {
                  // No parsed tasks - fall back to single-agent execution
                  logger.info(
                    `No parsed tasks, using single-agent execution for feature ${featureId}`
                  );

                  // Get customized prompts for continuation
                  const taskPrompts = await getPromptCustomization(
                    this.settingsService,
                    '[AutoMode]'
                  );
                  let continuationPrompt =
                    taskPrompts.taskExecution.continuationAfterApprovalTemplate;
                  continuationPrompt = continuationPrompt.replace(
                    /\{\{userFeedback\}\}/g,
                    userFeedback || ''
                  );
                  continuationPrompt = continuationPrompt.replace(
                    /\{\{approvedPlan\}\}/g,
                    approvedPlanContent
                  );

                  const continuationStream = provider.executeQuery({
                    prompt: continuationPrompt,
                    model: bareModel,
                    maxTurns: maxTurns,
                    cwd: workDir,
                    allowedTools: allowedTools,
                    abortController,
                    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                    credentials, // Pass credentials for resolving 'credentials' apiKeySource
                    claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
                  });

                  for await (const msg of continuationStream) {
                    if (msg.type === 'assistant' && msg.message?.content) {
                      for (const block of msg.message.content) {
                        if (block.type === 'text') {
                          responseText += block.text || '';
                          this.emitAutoModeEvent('auto_mode_progress', {
                            featureId,
                            branchName,
                            content: block.text,
                          });
                        } else if (block.type === 'tool_use') {
                          this.emitAutoModeEvent('auto_mode_tool', {
                            featureId,
                            branchName,
                            tool: block.name,
                            input: block.input,
                          });
                        }
                      }
                    } else if (msg.type === 'error') {
                      throw new Error(msg.error || 'Unknown error during implementation');
                    } else if (msg.type === 'result' && msg.subtype === 'success') {
                      responseText += msg.result || '';
                    }
                  }
                }

                logger.info(`Implementation completed for feature ${featureId}`);
                // Exit the original stream loop since continuation is done
                break streamLoop;
              }

              // Only emit progress for non-marker text (marker was already handled above)
              if (!specDetected) {
                logger.info(
                  `Emitting progress event for ${featureId}, content length: ${block.text?.length || 0}`
                );
                this.emitAutoModeEvent('auto_mode_progress', {
                  featureId,
                  branchName,
                  content: block.text,
                });
              }
            } else if (block.type === 'tool_use') {
              // Feed tool use to stream observer for loop detection (if enabled)
              if (streamObserver) {
                streamObserver.onToolUse(block.name || 'unknown', block.input);

                // Check if observer detected a loop or stall
                const abortCheck = streamObserver.shouldAbort();
                if (abortCheck.abort) {
                  logger.warn(
                    `Stream observer triggered abort for ${featureId}: ${abortCheck.reason}`
                  );
                  loopDetected = true;

                  // Emit loop detection event
                  this.events.emit(
                    'pipeline:loop-detected' as import('@protolabs-ai/types').EventType,
                    {
                      featureId,
                      loopSignature: streamObserver.getLoopSignature() || 'unknown',
                      actionTaken: 'abort_and_retry',
                    }
                  );

                  abortController.abort();
                  break streamLoop;
                }
              }

              // Emit event for real-time UI
              this.emitAutoModeEvent('auto_mode_tool', {
                featureId,
                branchName,
                tool: block.name,
                input: block.input,
              });

              // Also add to file output for persistence
              if (responseText.length > 0 && !responseText.endsWith('\n')) {
                responseText += '\n';
              }
              responseText += `\n🔧 Tool: ${block.name}\n`;
              if (block.input) {
                responseText += `Input: ${JSON.stringify(block.input, null, 2)}\n`;
              }
              scheduleWrite();
            }
          }
        } else if (msg.type === 'error') {
          // Handle error messages
          throw new Error(msg.error || 'Unknown error');
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          // Don't replace responseText - the accumulated content is the full history
          // The msg.result is just a summary which would lose all tool use details
          // Just ensure final write happens
          scheduleWrite();

          // Capture cost and session_id from SDK result
          const resultMsg = msg as unknown as { total_cost_usd?: number; session_id?: string };
          if (typeof resultMsg.total_cost_usd === 'number' && resultMsg.total_cost_usd > 0) {
            try {
              const currentFeature = await this.featureLoader.get(projectPath, featureId);
              const previousCost: number = currentFeature?.costUsd ?? 0;
              await this.featureLoader.update(projectPath, featureId, {
                costUsd: previousCost + resultMsg.total_cost_usd,
              });
              logger.info(
                `Feature ${featureId} cost: $${resultMsg.total_cost_usd.toFixed(4)} (total: $${(previousCost + resultMsg.total_cost_usd).toFixed(4)})`
              );
            } catch (costError) {
              logger.warn(`Failed to store cost for feature ${featureId}:`, costError);
            }
          }
          // Store session_id for potential resume
          if (resultMsg.session_id) {
            try {
              await this.featureLoader.update(projectPath, featureId, {
                lastSessionId: resultMsg.session_id,
              });
            } catch {
              // Non-critical
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'error_max_turns') {
          // Agent ran out of turns - capture session_id for resume, then throw for retry
          scheduleWrite();
          const errorResult = msg as unknown as { session_id?: string; total_cost_usd?: number };
          if (errorResult.session_id || errorResult.total_cost_usd) {
            try {
              const updates: Record<string, unknown> = {};
              if (errorResult.session_id) {
                updates.lastSessionId = errorResult.session_id;
              }
              if (
                typeof errorResult.total_cost_usd === 'number' &&
                errorResult.total_cost_usd > 0
              ) {
                const currentFeature = await this.featureLoader.get(projectPath, featureId);
                const previousCost: number = currentFeature?.costUsd ?? 0;
                updates.costUsd = previousCost + errorResult.total_cost_usd;
              }
              await this.featureLoader.update(projectPath, featureId, updates);
            } catch {
              // Non-critical
            }
          }
          throw new Error(
            `error_max_turns: Agent exhausted max turns limit. The feature may need more turns to complete.`
          );
        }
      }

      // Final write - ensure all accumulated content is saved (on success path)
      await writeToFile();

      // If loop was detected, throw a recognizable error for retry with recovery context
      if (loopDetected) {
        const loopSig = streamObserver?.getLoopSignature() || 'unknown';
        throw new LoopDetectedError(
          `Agent loop detected (${loopSig}). Aborting for retry with recovery guidance.`,
          loopSig
        );
      }

      // Flush remaining raw output (only if enabled, on success path)
      if (enableRawOutput && rawOutputLines.length > 0) {
        try {
          await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
          await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
        } catch (error) {
          logger.error(`Failed to write final raw output for ${featureId}:`, error);
        }
      }
    } finally {
      clearInterval(streamHeartbeat);
      clearInterval(memoryHeartbeat);
      // ALWAYS clear pending timeouts to prevent memory leaks
      // This runs on success, error, or abort
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      if (rawWriteTimeout) {
        clearTimeout(rawWriteTimeout);
        rawWriteTimeout = null;
      }

      // Save Langfuse trace ID to feature for observability linking
      const providerWithTrace = provider as unknown as { getLastTraceId?: () => string | null };
      if (typeof providerWithTrace.getLastTraceId === 'function') {
        const lastTraceId = providerWithTrace.getLastTraceId();
        if (lastTraceId) {
          try {
            await this.featureLoader.update(projectPath, featureId, { lastTraceId });
          } catch (traceErr) {
            logger.warn(`Failed to save traceId for ${featureId}:`, traceErr);
          }
        }
      }
    }
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
   * Build a focused prompt for executing a single task.
   * Each task gets minimal context to keep the agent focused.
   */
  private buildTaskPrompt(
    task: ParsedTask,
    allTasks: ParsedTask[],
    taskIndex: number,
    planContent: string,
    taskPromptTemplate: string,
    userFeedback?: string
  ): string {
    const completedTasks = allTasks.slice(0, taskIndex);
    const remainingTasks = allTasks.slice(taskIndex + 1);

    // Build completed tasks string
    const completedTasksStr =
      completedTasks.length > 0
        ? `### Already Completed (${completedTasks.length} tasks)\n${completedTasks.map((t) => `- [x] ${t.id}: ${t.description}`).join('\n')}\n`
        : '';

    // Build remaining tasks string
    const remainingTasksStr =
      remainingTasks.length > 0
        ? `### Coming Up Next (${remainingTasks.length} tasks remaining)\n${remainingTasks
            .slice(0, 3)
            .map((t) => `- [ ] ${t.id}: ${t.description}`)
            .join(
              '\n'
            )}${remainingTasks.length > 3 ? `\n... and ${remainingTasks.length - 3} more tasks` : ''}\n`
        : '';

    // Build user feedback string
    const userFeedbackStr = userFeedback ? `### User Feedback\n${userFeedback}\n` : '';

    // Use centralized template with variable substitution
    let prompt = taskPromptTemplate;
    prompt = prompt.replace(/\{\{taskId\}\}/g, task.id);
    prompt = prompt.replace(/\{\{taskDescription\}\}/g, task.description);
    prompt = prompt.replace(/\{\{taskFilePath\}\}/g, task.filePath || '');
    prompt = prompt.replace(/\{\{taskPhase\}\}/g, task.phase || '');
    prompt = prompt.replace(/\{\{completedTasks\}\}/g, completedTasksStr);
    prompt = prompt.replace(/\{\{remainingTasks\}\}/g, remainingTasksStr);
    prompt = prompt.replace(/\{\{userFeedback\}\}/g, userFeedbackStr);
    prompt = prompt.replace(/\{\{planContent\}\}/g, planContent);

    return prompt;
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   * Rate-limits auto_mode_progress events to max 1 per 100ms per feature.
   */
  private emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void {
    // Rate-limit auto_mode_progress events to prevent WebSocket overload
    if (eventType === 'auto_mode_progress') {
      const featureId = (data.featureId as string) || '';
      const now = Date.now();
      const lastTime = this.lastProgressEventTime.get(featureId) || 0;

      // Drop event if too soon since last progress event for this feature
      if (now - lastTime < this.PROGRESS_EVENT_MIN_INTERVAL_MS) {
        return;
      }

      this.lastProgressEventTime.set(featureId, now);
    }

    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });
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

  /**
   * Extract and record learnings from a completed feature
   * Uses a quick Claude call to identify important decisions and patterns
   */
  private async recordLearningsFromFeature(
    projectPath: string,
    feature: Feature,
    agentOutput: string
  ): Promise<void> {
    if (!agentOutput || agentOutput.length < 100) {
      // Not enough output to extract learnings from
      logger.debug(
        `Skipping learning extraction - output too short (${agentOutput?.length || 0} chars)`
      );
      return;
    }

    logger.info(
      `Extracting learnings from feature "${feature.title}" (${agentOutput.length} chars)`
    );

    // Limit output to avoid token limits
    const truncatedOutput = agentOutput.length > 10000 ? agentOutput.slice(-10000) : agentOutput;

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Build user prompt using centralized template with variable substitution
    let userPrompt = prompts.taskExecution.learningExtractionUserPromptTemplate;
    userPrompt = userPrompt.replace(/\{\{featureTitle\}\}/g, feature.title || '');
    userPrompt = userPrompt.replace(/\{\{implementationLog\}\}/g, truncatedOutput);

    try {
      // Get model from phase settings
      const settings = await this.settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.memoryExtractionModel || DEFAULT_PHASE_MODELS.memoryExtractionModel;
      const { model } = resolvePhaseModel(phaseModelEntry);
      const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY);
      let resolvedModel = model;

      if (isClaudeModel(model) && !hasClaudeKey) {
        const fallbackModel = feature.model
          ? resolveModelString(feature.model, DEFAULT_MODELS.autoMode)
          : null;
        if (fallbackModel && !isClaudeModel(fallbackModel)) {
          logger.debug(
            `Claude not configured for memory extraction; using feature model "${fallbackModel}".`
          );
          resolvedModel = fallbackModel;
        } else {
          logger.debug(
            'Claude not configured for memory extraction; skipping learning extraction.'
          );
          return;
        }
      }

      const result = await simpleQuery({
        prompt: userPrompt,
        model: resolvedModel,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: prompts.taskExecution.learningExtractionSystemPrompt,
      });

      const responseText = result.text;

      logger.debug(`Learning extraction response: ${responseText.length} chars`);
      logger.debug(`Response preview: ${responseText.substring(0, 300)}`);

      // Parse the response - handle JSON in markdown code blocks or raw
      let jsonStr: string | null = null;

      // First try to find JSON in markdown code blocks
      const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        logger.debug('Found JSON in code block');
        jsonStr = codeBlockMatch[1];
      } else {
        // Fall back to finding balanced braces containing "learnings"
        // Use a more precise approach: find the opening brace before "learnings"
        const learningsIndex = responseText.indexOf('"learnings"');
        if (learningsIndex !== -1) {
          // Find the opening brace before "learnings"
          let braceStart = responseText.lastIndexOf('{', learningsIndex);
          if (braceStart !== -1) {
            // Find matching closing brace
            let braceCount = 0;
            let braceEnd = -1;
            for (let i = braceStart; i < responseText.length; i++) {
              if (responseText[i] === '{') braceCount++;
              if (responseText[i] === '}') braceCount--;
              if (braceCount === 0) {
                braceEnd = i;
                break;
              }
            }
            if (braceEnd !== -1) {
              jsonStr = responseText.substring(braceStart, braceEnd + 1);
            }
          }
        }
      }

      if (!jsonStr) {
        logger.debug('Could not extract JSON from response');
        return;
      }

      logger.debug(`Extracted JSON: ${jsonStr.substring(0, 200)}`);

      let parsed: { learnings?: unknown[] };
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        logger.warn('Failed to parse learnings JSON:', jsonStr.substring(0, 200));
        return;
      }

      if (!parsed.learnings || !Array.isArray(parsed.learnings)) {
        logger.debug('No learnings array in parsed response');
        return;
      }

      logger.debug(`Found ${parsed.learnings.length} potential learnings`);

      // Valid learning types
      const validTypes = new Set(['decision', 'learning', 'pattern', 'gotcha']);

      // Create deduplication checker if knowledge store is available
      const dedupThreshold = settings?.knowledgeDedupThreshold ?? -0.5;
      const dedupChecker: DedupChecker | undefined = this.knowledgeStoreService
        ? async (
            projPath: string,
            learning: import('@protolabs-ai/utils').LearningEntry,
            targetFile: string
          ) => {
            if (!this.knowledgeStoreService) return false;

            try {
              // Search for similar chunks in the target memory file
              const similarChunks = this.knowledgeStoreService.findSimilarChunks(
                projPath,
                learning.content,
                `.automaker/memory/${targetFile}`,
                1
              );

              if (similarChunks.length > 0 && similarChunks[0].score < dedupThreshold) {
                logger.debug(
                  `Duplicate detected: score=${similarChunks[0].score} < threshold=${dedupThreshold}`
                );
                return true;
              }

              return false;
            } catch (error) {
              logger.warn('Error checking for duplicates:', error);
              return false; // On error, allow the learning to be written
            }
          }
        : undefined;

      // Create index rebuilder if knowledge store is available
      const indexRebuilder: IndexRebuilder | undefined = this.knowledgeStoreService
        ? async (projPath: string) => {
            if (!this.knowledgeStoreService) return;

            try {
              logger.debug('Rebuilding knowledge store index after learning append');
              this.knowledgeStoreService.rebuildIndex(projPath);
            } catch (error) {
              logger.warn('Error rebuilding knowledge store index:', error);
            }
          }
        : undefined;

      // Track unique categories for compaction check
      const updatedCategories = new Set<string>();

      // Record each learning
      for (const item of parsed.learnings) {
        // Validate required fields with proper type narrowing
        if (!item || typeof item !== 'object') continue;

        const learning = item as Record<string, unknown>;
        if (
          !learning.category ||
          typeof learning.category !== 'string' ||
          !learning.content ||
          typeof learning.content !== 'string' ||
          !learning.content.trim()
        ) {
          continue;
        }

        // Validate and normalize type
        const typeStr = typeof learning.type === 'string' ? learning.type : 'learning';
        const learningType = validTypes.has(typeStr)
          ? (typeStr as 'decision' | 'learning' | 'pattern' | 'gotcha')
          : 'learning';

        logger.debug(`Appending learning: category=${learning.category}, type=${learningType}`);
        await appendLearning(
          projectPath,
          {
            category: learning.category,
            type: learningType,
            content: learning.content.trim(),
            context: typeof learning.context === 'string' ? learning.context : undefined,
            why: typeof learning.why === 'string' ? learning.why : undefined,
            rejected: typeof learning.rejected === 'string' ? learning.rejected : undefined,
            tradeoffs: typeof learning.tradeoffs === 'string' ? learning.tradeoffs : undefined,
            breaking: typeof learning.breaking === 'string' ? learning.breaking : undefined,
          },
          secureFs as Parameters<typeof appendLearning>[2],
          dedupChecker,
          indexRebuilder
        );

        // Track category for compaction check
        const sanitizedCategory = learning.category
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        updatedCategories.add(`${sanitizedCategory || 'general'}.md`);
      }

      // Check each updated category for compaction
      if (this.knowledgeStoreService && updatedCategories.size > 0) {
        for (const categoryFile of updatedCategories) {
          try {
            await this.knowledgeStoreService.compactCategory(projectPath, categoryFile);
          } catch (error) {
            logger.warn(`Failed to compact category ${categoryFile}:`, error);
          }
        }
      }

      const validLearnings = parsed.learnings.filter(
        (l) => l && typeof l === 'object' && (l as Record<string, unknown>).content
      );
      if (validLearnings.length > 0) {
        logger.info(`Recorded ${parsed.learnings.length} learning(s) from feature ${feature.id}`);
      }
    } catch (error) {
      logger.warn(`Failed to extract learnings from feature ${feature.id}:`, error);
    }
  }
}
