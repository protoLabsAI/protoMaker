/**
 * GOAP Loop Service - Autonomous management brain loop
 *
 * Sits above auto-mode as a management layer. Evaluates world state each tick,
 * selects the highest-priority unsatisfied goal, finds the best action to
 * address it, and executes. Uses simple greedy selection (not A*).
 *
 * Pattern: Singleton with per-project loops stored in a Map.
 * Lifecycle: setTimeout-based (like RalphLoopService).
 */

import type {
  GOAPState,
  GOAPGoal,
  GOAPAction,
  GOAPCondition,
  GOAPActionResult,
  GOAPLoopConfig,
  GOAPLoopStatus,
  WorldStateSnapshot,
  EventType,
} from '@automaker/types';
import { areConditionsSatisfied } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { randomUUID } from 'crypto';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import { evaluateWorldState } from './world-state-evaluator.js';

const TICK_TIMEOUT_MS = 60_000; // 60s max per tick operation

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const logger = createLogger('GOAPLoop');

// ─── POC Goals (hardcoded) ───────────────────────────────────────────────────

const POC_GOALS: GOAPGoal[] = [
  {
    id: 'keep_shipping',
    name: 'Keep Shipping',
    // Satisfied when auto-mode is running (handling backlog) or no backlog exists.
    // start_auto_mode effect (auto_mode_running=true) directly satisfies this goal.
    conditions: [{ key: 'auto_mode_running', value: true }],
    priority: 10,
  },
  {
    id: 'recover_failures',
    name: 'Recover Failures',
    conditions: [{ key: 'has_failed_features', value: false }],
    priority: 9,
  },
  {
    id: 'maintain_health',
    name: 'Maintain Health',
    conditions: [{ key: 'has_stale_features', value: false }],
    priority: 7,
  },
  {
    id: 'stay_productive',
    name: 'Stay Productive',
    conditions: [{ key: 'is_idle', value: false }],
    priority: 5,
  },
];

// ─── POC Actions (hardcoded) ─────────────────────────────────────────────────

const POC_ACTIONS: GOAPAction[] = [
  {
    id: 'start_auto_mode',
    name: 'Start Auto-Mode',
    preconditions: [
      { key: 'has_backlog_work', value: true },
      { key: 'auto_mode_running', value: false },
    ],
    effects: [{ key: 'auto_mode_running', value: true }],
    cost: 1,
  },
  {
    id: 'retry_failed_feature',
    name: 'Retry Failed Feature',
    preconditions: [{ key: 'has_failed_features', value: true }],
    effects: [{ key: 'has_failed_features', value: false }],
    cost: 3,
  },
  {
    id: 'escalate_stuck_feature',
    name: 'Escalate Stuck Feature',
    preconditions: [{ key: 'has_stale_features', value: true }],
    effects: [{ key: 'has_stale_features', value: false }],
    cost: 5,
  },
  {
    id: 'log_idle',
    name: 'Log Idle',
    preconditions: [{ key: 'is_idle', value: true }],
    effects: [],
    cost: 0,
  },
];

// ─── Internal state per running loop ─────────────────────────────────────────

interface RunningGOAPLoop {
  config: GOAPLoopConfig;
  isRunning: boolean;
  isPaused: boolean;
  tickCount: number;
  consecutiveErrors: number;
  lastWorldState: WorldStateSnapshot | null;
  unsatisfiedGoals: GOAPGoal[];
  availableActions: GOAPAction[];
  lastAction: GOAPActionResult | null;
  actionHistory: GOAPActionResult[];
  startedAt: string;
  lastTickAt?: string;
  lastError?: string;
  loopTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class GOAPLoopService {
  private static instance: GOAPLoopService | null = null;

  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private autoModeService: AutoModeService;
  private loops = new Map<string, RunningGOAPLoop>();

  private constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.autoModeService = autoModeService;
  }

  static getInstance(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService
  ): GOAPLoopService {
    if (!GOAPLoopService.instance) {
      GOAPLoopService.instance = new GOAPLoopService(events, featureLoader, autoModeService);
    }
    return GOAPLoopService.instance;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async startLoop(config: GOAPLoopConfig): Promise<void> {
    const key = this.loopKey(config.projectPath);
    if (this.loops.has(key)) {
      throw new Error(`GOAP loop already running for project: ${config.projectPath}`);
    }

    const loop: RunningGOAPLoop = {
      config,
      isRunning: true,
      isPaused: false,
      tickCount: 0,
      consecutiveErrors: 0,
      lastWorldState: null,
      unsatisfiedGoals: [],
      availableActions: [],
      lastAction: null,
      actionHistory: [],
      startedAt: new Date().toISOString(),
      loopTimer: null,
    };

    this.loops.set(key, loop);
    logger.info('GOAP loop started', { projectPath: config.projectPath });
    this.emit('goap:started', { projectPath: config.projectPath, status: this.toStatus(loop) });

    // Start first tick
    this.scheduleTick(loop);
  }

  async stopLoop(projectPath: string): Promise<void> {
    const key = this.loopKey(projectPath);
    const loop = this.loops.get(key);
    if (!loop) {
      throw new Error(`No GOAP loop running for project: ${projectPath}`);
    }

    this.clearTimer(loop);
    loop.isRunning = false;
    this.loops.delete(key);
    logger.info('GOAP loop stopped', { projectPath });
    this.emit('goap:stopped', { projectPath, status: this.toStatus(loop) });
  }

  async pauseLoop(projectPath: string): Promise<void> {
    const key = this.loopKey(projectPath);
    const loop = this.loops.get(key);
    if (!loop || !loop.isRunning) {
      throw new Error(`No running GOAP loop for project: ${projectPath}`);
    }

    this.clearTimer(loop);
    loop.isPaused = true;
    logger.info('GOAP loop paused', { projectPath });
    this.emit('goap:paused', { projectPath, status: this.toStatus(loop) });
  }

  async resumeLoop(projectPath: string): Promise<void> {
    const key = this.loopKey(projectPath);
    const loop = this.loops.get(key);
    if (!loop || !loop.isPaused) {
      throw new Error(`No paused GOAP loop for project: ${projectPath}`);
    }

    loop.isPaused = false;
    logger.info('GOAP loop resumed', { projectPath });
    this.emit('goap:resumed', { projectPath, status: this.toStatus(loop) });
    this.scheduleTick(loop);
  }

  getStatus(projectPath: string): GOAPLoopStatus | null {
    const key = this.loopKey(projectPath);
    const loop = this.loops.get(key);
    if (!loop) return null;
    return this.toStatus(loop);
  }

  listRunningLoops(): GOAPLoopStatus[] {
    return Array.from(this.loops.values()).map((loop) => this.toStatus(loop));
  }

  async stopAllLoops(): Promise<void> {
    const keys = Array.from(this.loops.keys());
    for (const key of keys) {
      const loop = this.loops.get(key);
      if (loop) {
        this.clearTimer(loop);
        loop.isRunning = false;
        this.emit('goap:stopped', {
          projectPath: loop.config.projectPath,
          status: this.toStatus(loop),
        });
        this.loops.delete(key);
        logger.info('GOAP loop stopped (shutdown)', { projectPath: loop.config.projectPath });
      }
    }
  }

  // ─── Tick ────────────────────────────────────────────────────────────────

  private scheduleTick(loop: RunningGOAPLoop): void {
    this.clearTimer(loop);
    if (!loop.isRunning || loop.isPaused) return;

    loop.loopTimer = setTimeout(
      () => {
        void this.tick(loop);
      },
      loop.tickCount === 0 ? 0 : loop.config.tickIntervalMs
    );
    // First tick runs immediately
  }

  private async tick(loop: RunningGOAPLoop): Promise<void> {
    if (!loop.isRunning || loop.isPaused) return;

    const { config } = loop;
    const tickStart = Date.now();

    try {
      // 1. Evaluate world state
      const state = await withTimeout(
        evaluateWorldState(
          config.projectPath,
          config.branchName,
          this.featureLoader,
          this.autoModeService
        ),
        TICK_TIMEOUT_MS,
        'evaluateWorldState'
      );

      const evaluationDurationMs = Date.now() - tickStart;
      const snapshot: WorldStateSnapshot = {
        id: randomUUID(),
        projectPath: config.projectPath,
        state,
        capturedAt: new Date().toISOString(),
        evaluationDurationMs,
      };
      loop.lastWorldState = snapshot;
      this.emit('goap:world_state_updated', { projectPath: config.projectPath, snapshot });

      // 2. Find unsatisfied goals
      const unsatisfiedGoals = POC_GOALS.filter(
        (g) => !areConditionsSatisfied(g.conditions, state)
      ).sort((a, b) => b.priority - a.priority);
      loop.unsatisfiedGoals = unsatisfiedGoals;

      // 3. Find available actions (preconditions met)
      const availableActions = POC_ACTIONS.filter((a) =>
        areConditionsSatisfied(a.preconditions, state)
      );
      loop.availableActions = availableActions;

      // 4. Select best action
      const selectedAction = this.selectBestAction(state, unsatisfiedGoals, availableActions);

      // 5. Execute
      if (selectedAction) {
        this.emit('goap:action_selected', {
          projectPath: config.projectPath,
          action: selectedAction,
        });

        const result = await withTimeout(
          this.executeAction(config.projectPath, config.branchName, selectedAction),
          TICK_TIMEOUT_MS,
          `executeAction(${selectedAction.id})`
        );
        this.pushActionHistory(loop, result);

        if (result.success) {
          loop.consecutiveErrors = 0;
          this.emit('goap:action_executed', { projectPath: config.projectPath, result });
        } else {
          loop.consecutiveErrors++;
          loop.lastError = result.error;
          this.emit('goap:action_failed', { projectPath: config.projectPath, result });
        }

        loop.lastAction = result;
      } else {
        this.emit('goap:no_action_available', {
          projectPath: config.projectPath,
          unsatisfiedGoals: unsatisfiedGoals.map((g) => g.id),
        });
      }

      // 6. Increment tick
      loop.tickCount++;
      loop.lastTickAt = new Date().toISOString();
      this.emit('goap:tick', { projectPath: config.projectPath, status: this.toStatus(loop) });

      // 7. Check error threshold
      if (loop.consecutiveErrors >= config.maxConsecutiveErrors) {
        logger.warn('GOAP loop auto-paused due to consecutive errors', {
          projectPath: config.projectPath,
          consecutiveErrors: loop.consecutiveErrors,
        });
        loop.isPaused = true;
        this.emit('goap:paused', {
          projectPath: config.projectPath,
          reason: 'max_consecutive_errors',
          status: this.toStatus(loop),
        });
        return; // Don't schedule next tick
      }
    } catch (error) {
      loop.consecutiveErrors++;
      loop.lastError = error instanceof Error ? error.message : String(error);
      logger.error('GOAP tick error', { projectPath: config.projectPath, error: loop.lastError });
      this.emit('goap:error', { projectPath: config.projectPath, error: loop.lastError });

      if (loop.consecutiveErrors >= config.maxConsecutiveErrors) {
        loop.isPaused = true;
        this.emit('goap:paused', {
          projectPath: config.projectPath,
          reason: 'max_consecutive_errors',
          status: this.toStatus(loop),
        });
        return;
      }
    }

    // Schedule next tick
    this.scheduleTick(loop);
  }

  // ─── Action Selection (greedy) ───────────────────────────────────────────

  private selectBestAction(
    state: GOAPState,
    unsatisfiedGoals: GOAPGoal[],
    availableActions: GOAPAction[]
  ): GOAPAction | null {
    if (availableActions.length === 0) return null;

    // For each unsatisfied goal (highest priority first),
    // find actions whose effects contribute to satisfying that goal
    for (const goal of unsatisfiedGoals) {
      const candidates = availableActions.filter((action) =>
        action.effects.some((effect) =>
          goal.conditions.some(
            (condition) => condition.key === effect.key && condition.value === effect.value
          )
        )
      );

      if (candidates.length > 0) {
        // Pick lowest cost
        candidates.sort((a, b) => a.cost - b.cost);
        return candidates[0];
      }
    }

    // Fallback: any available action (lowest cost)
    const sorted = [...availableActions].sort((a, b) => a.cost - b.cost);
    return sorted[0] || null;
  }

  // ─── Action Execution ────────────────────────────────────────────────────

  private async executeAction(
    projectPath: string,
    branchName: string | null,
    action: GOAPAction
  ): Promise<GOAPActionResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    try {
      switch (action.id) {
        case 'start_auto_mode': {
          await this.autoModeService.startAutoLoopForProject(projectPath, branchName);
          logger.info('GOAP action: started auto-mode', { projectPath });
          break;
        }

        case 'retry_failed_feature': {
          const MAX_RETRIES = 3;
          const features = await this.featureLoader.getAll(projectPath);
          const failed = features.find(
            (f) => f.status === 'failed' && (f.failureCount || 0) < MAX_RETRIES
          );
          if (failed) {
            const newFailureCount = (failed.failureCount || 0) + 1;
            await this.featureLoader.update(projectPath, failed.id, {
              status: 'backlog',
              failureCount: newFailureCount,
              error: undefined,
            });
            logger.info('GOAP action: retried failed feature', {
              projectPath,
              featureId: failed.id,
              failureCount: newFailureCount,
            });
          } else {
            logger.debug('GOAP action: no failed features found to retry');
          }
          break;
        }

        case 'escalate_stuck_feature': {
          const features = await this.featureLoader.getAll(projectPath);
          const now = Date.now();
          const staleThreshold = 2 * 60 * 60 * 1000;
          const stale = features.find(
            (f) =>
              f.status === 'running' &&
              f.startedAt &&
              now - new Date(f.startedAt).getTime() > staleThreshold
          );
          if (stale) {
            // Reset startedAt so the feature isn't immediately re-detected as stale
            await this.featureLoader.update(projectPath, stale.id, {
              complexity: 'architectural',
              startedAt: new Date().toISOString(),
            });
            logger.info('GOAP action: escalated stuck feature to architectural', {
              projectPath,
              featureId: stale.id,
            });
          } else {
            logger.debug('GOAP action: no stale features found to escalate');
          }
          break;
        }

        case 'log_idle': {
          logger.debug('GOAP action: system is idle, nothing to do', { projectPath });
          break;
        }

        default:
          throw new Error(`Unknown GOAP action: ${action.id}`);
      }

      return {
        action,
        success: true,
        appliedEffects: action.effects,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Don't treat "already running" as a failure for start_auto_mode
      if (action.id === 'start_auto_mode' && errorMsg.includes('already running')) {
        return {
          action,
          success: true,
          appliedEffects: action.effects,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        };
      }

      logger.error('GOAP action failed', { actionId: action.id, error: errorMsg });
      return {
        action,
        success: false,
        error: errorMsg,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // POC: keyed by projectPath only. Multi-branch support would require
  // threading branchName through public API and route contracts.
  private loopKey(projectPath: string): string {
    return projectPath;
  }

  private clearTimer(loop: RunningGOAPLoop): void {
    if (loop.loopTimer) {
      clearTimeout(loop.loopTimer);
      loop.loopTimer = null;
    }
  }

  private pushActionHistory(loop: RunningGOAPLoop, result: GOAPActionResult): void {
    loop.actionHistory.push(result);
    if (loop.actionHistory.length > loop.config.maxActionHistorySize) {
      loop.actionHistory = loop.actionHistory.slice(-loop.config.maxActionHistorySize);
    }
  }

  private toStatus(loop: RunningGOAPLoop): GOAPLoopStatus {
    return {
      projectPath: loop.config.projectPath,
      branchName: loop.config.branchName,
      isRunning: loop.isRunning,
      isPaused: loop.isPaused,
      tickCount: loop.tickCount,
      lastWorldState: loop.lastWorldState,
      unsatisfiedGoals: loop.unsatisfiedGoals,
      availableActions: loop.availableActions,
      lastAction: loop.lastAction,
      actionHistory: loop.actionHistory,
      consecutiveErrors: loop.consecutiveErrors,
      lastError: loop.lastError,
      startedAt: loop.startedAt,
      lastTickAt: loop.lastTickAt,
    };
  }

  private emit(type: EventType, payload: unknown): void {
    this.events.emit(type, payload);
  }
}
