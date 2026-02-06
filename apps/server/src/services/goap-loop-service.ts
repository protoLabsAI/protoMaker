/**
 * GOAP Loop Service - Autonomous management brain loop
 *
 * Sits above auto-mode as a management layer. Uses A* planning to generate
 * multi-step plans, then executes one step per tick. Re-plans on divergence.
 *
 * Tick algorithm:
 * 1. Evaluate world state
 * 2. Select role → weight goals
 * 3. Plan lifecycle check:
 *    a. No plan → PLAN for highest-priority unsatisfied goal
 *    b. Plan complete (all steps done) → clear, PLAN
 *    c. Next step preconditions unmet → invalidate, PLAN
 *    d. Goal already satisfied → clear plan (success)
 *    e. Higher-priority unsatisfied goal appeared → invalidate, PLAN
 *    f. Plan valid → EXECUTE next step
 * 4. Execute one action via registry handler
 * 5. If success: advance step. If fail: invalidate plan.
 * 6. Emit events, schedule next tick
 *
 * Pattern: Singleton with per-project loops stored in a Map.
 * Lifecycle: setTimeout-based (like RalphLoopService).
 */

import type {
  GOAPState,
  GOAPGoal,
  GOAPAction,
  GOAPActionResult,
  GOAPLoopConfig,
  GOAPLoopStatus,
  GOAPRole,
  GOAPPlan,
  WorldStateSnapshot,
  EventType,
} from '@automaker/types';
import { areConditionsSatisfied, planActions } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { randomUUID } from 'crypto';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { GOAPActionRegistry } from './goap-action-registry.js';
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

// ─── Base Goals (priorities assigned by roles) ──────────────────────────────

const BASE_GOALS: Omit<GOAPGoal, 'priority'>[] = [
  {
    id: 'keep_shipping',
    name: 'Keep Shipping',
    conditions: [{ key: 'auto_mode_running', value: true }],
  },
  {
    id: 'recover_failures',
    name: 'Recover Failures',
    conditions: [{ key: 'has_failed_features', value: false }],
  },
  {
    id: 'maintain_health',
    name: 'Maintain Health',
    conditions: [{ key: 'has_stale_features', value: false }],
  },
  {
    id: 'stay_productive',
    name: 'Stay Productive',
    conditions: [{ key: 'is_idle', value: false }],
  },
  {
    id: 'clear_pipeline',
    name: 'Clear Pipeline',
    conditions: [
      { key: 'has_completed_features', value: false },
      { key: 'has_blocked_ready_features', value: false },
    ],
  },
  {
    id: 'manage_wip',
    name: 'Manage WIP',
    conditions: [
      { key: 'has_very_stale_features', value: false },
      { key: 'has_chronic_failures', value: false },
    ],
  },
];

// ─── Roles (determine goal priority weighting) ─────────────────────────────

const ROLES: GOAPRole[] = [
  {
    id: 'guardian',
    name: 'Guardian',
    description: 'Recover from failures and restore system health',
    goalPriorities: {
      recover_failures: 10,
      manage_wip: 9,
      maintain_health: 8,
      clear_pipeline: 6,
      keep_shipping: 5,
      stay_productive: 3,
    },
    activationConditions: [{ key: 'failed_count', value: 2, operator: 'gte' }],
    activationPriority: 20,
  },
  {
    id: 'janitor',
    name: 'Janitor',
    description: 'Clean up stale work and board hygiene',
    goalPriorities: {
      maintain_health: 10,
      clear_pipeline: 9,
      manage_wip: 8,
      recover_failures: 7,
      stay_productive: 5,
      keep_shipping: 3,
    },
    activationConditions: [{ key: 'stale_feature_count', value: 2, operator: 'gte' }],
    activationPriority: 10,
  },
  {
    id: 'shipper',
    name: 'Shipper',
    description: 'Push features through the pipeline',
    goalPriorities: {
      keep_shipping: 10,
      clear_pipeline: 9,
      recover_failures: 8,
      maintain_health: 5,
      manage_wip: 4,
      stay_productive: 3,
    },
    activationConditions: [], // Always matches — fallback role
    activationPriority: 0,
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
  activeRoleId: string | null;
  roleOverride: string | null;
  roleSelectionReason?: string;
  // Plan state
  currentPlan: GOAPPlan | null;
  currentPlanStep: number;
  lastReplanReason?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class GOAPLoopService {
  private static instance: GOAPLoopService | null = null;

  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private autoModeService: AutoModeService;
  private registry: GOAPActionRegistry | null;
  private loops = new Map<string, RunningGOAPLoop>();

  private constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService,
    registry: GOAPActionRegistry | null = null
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.autoModeService = autoModeService;
    this.registry = registry;
  }

  static getInstance(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService,
    registry?: GOAPActionRegistry | null
  ): GOAPLoopService {
    if (!GOAPLoopService.instance) {
      GOAPLoopService.instance = new GOAPLoopService(
        events,
        featureLoader,
        autoModeService,
        registry ?? null
      );
    } else if (registry && !GOAPLoopService.instance.registry) {
      // Allow setting registry after initial creation (for wiring order)
      GOAPLoopService.instance.registry = registry;
    }
    return GOAPLoopService.instance;
  }

  /**
   * Set the action registry (for deferred wiring after singleton creation).
   */
  setRegistry(registry: GOAPActionRegistry): void {
    this.registry = registry;
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
      activeRoleId: null,
      roleOverride: null,
      currentPlan: null,
      currentPlanStep: 0,
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

  setRoleOverride(projectPath: string, roleId: string | null): void {
    const key = this.loopKey(projectPath);
    const loop = this.loops.get(key);
    if (!loop) throw new Error(`No GOAP loop running for project: ${projectPath}`);
    if (roleId !== null && !ROLES.find((r) => r.id === roleId)) {
      throw new Error(
        `Invalid role ID: ${roleId}. Available: ${ROLES.map((r) => r.id).join(', ')}`
      );
    }
    loop.roleOverride = roleId;
    if (roleId === null) {
      loop.roleSelectionReason = undefined;
    }
    logger.info('GOAP role override set', { projectPath, roleId });
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

      // 2. Select role (determines goal priority weighting)
      const role = this.selectRole(loop, state);
      loop.activeRoleId = role.id;

      // 3. Apply role priorities to get GOAPGoal[] for this tick
      const goals: GOAPGoal[] = BASE_GOALS.map((g) => ({
        ...g,
        priority: role.goalPriorities[g.id] ?? 0,
      }));

      // 4. Find unsatisfied goals (sorted by priority descending)
      const unsatisfiedGoals = goals
        .filter((g) => !areConditionsSatisfied(g.conditions, state))
        .sort((a, b) => b.priority - a.priority);
      loop.unsatisfiedGoals = unsatisfiedGoals;

      // 5. Get available actions from registry (or empty if no registry)
      const allActions = this.registry?.getAllDefinitions() ?? [];
      const availableActions = allActions.filter((a) =>
        areConditionsSatisfied(a.preconditions, state)
      );
      loop.availableActions = availableActions;

      // 6. Plan lifecycle
      const action = this.planLifecycle(loop, state, unsatisfiedGoals, allActions);

      // 7. Execute one action
      if (action) {
        this.emit('goap:action_selected', {
          projectPath: config.projectPath,
          action,
        });

        const result = await withTimeout(
          this.executeAction(config.projectPath, config.branchName, action),
          TICK_TIMEOUT_MS,
          `executeAction(${action.id})`
        );
        this.pushActionHistory(loop, result);

        if (result.success) {
          loop.consecutiveErrors = 0;
          // Advance plan step
          if (loop.currentPlan) {
            loop.currentPlanStep++;
            this.emit('goap:plan_step_executed', {
              projectPath: config.projectPath,
              action,
              step: loop.currentPlanStep,
              totalSteps: loop.currentPlan.actions.length,
            });
            // Check if plan is now complete
            if (loop.currentPlanStep >= loop.currentPlan.actions.length) {
              this.emit('goap:plan_completed', {
                projectPath: config.projectPath,
                plan: loop.currentPlan,
              });
              loop.currentPlan = null;
              loop.currentPlanStep = 0;
            }
          }
          this.emit('goap:action_executed', { projectPath: config.projectPath, result });
        } else {
          loop.consecutiveErrors++;
          loop.lastError = result.error;
          // Invalidate plan on failure
          if (loop.currentPlan) {
            loop.lastReplanReason = `Action ${action.id} failed: ${result.error}`;
            this.emit('goap:plan_invalidated', {
              projectPath: config.projectPath,
              reason: loop.lastReplanReason,
            });
            loop.currentPlan = null;
            loop.currentPlanStep = 0;
          }
          this.emit('goap:action_failed', { projectPath: config.projectPath, result });
        }

        loop.lastAction = result;
      } else {
        this.emit('goap:no_action_available', {
          projectPath: config.projectPath,
          unsatisfiedGoals: unsatisfiedGoals.map((g) => g.id),
        });
      }

      // 8. Increment tick
      loop.tickCount++;
      loop.lastTickAt = new Date().toISOString();
      this.emit('goap:tick', { projectPath: config.projectPath, status: this.toStatus(loop) });

      // 9. Check error threshold
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

  // ─── Plan Lifecycle ─────────────────────────────────────────────────────

  /**
   * Manages the plan lifecycle:
   * - If no plan exists, generate one for the highest-priority unsatisfied goal
   * - If plan is complete (all steps executed), clear it and generate new
   * - If current step's preconditions are unmet, invalidate and replan
   * - If the goal is already satisfied, clear plan (success)
   * - If a higher-priority goal appeared, invalidate and replan
   * - If plan is valid, return the next action to execute
   *
   * Returns the action to execute this tick, or null if no action.
   */
  private planLifecycle(
    loop: RunningGOAPLoop,
    state: GOAPState,
    unsatisfiedGoals: GOAPGoal[],
    allActions: GOAPAction[]
  ): GOAPAction | null {
    const { config } = loop;

    // If no unsatisfied goals, nothing to do
    if (unsatisfiedGoals.length === 0) {
      if (loop.currentPlan) {
        loop.lastReplanReason = 'All goals satisfied';
        loop.currentPlan = null;
        loop.currentPlanStep = 0;
      }
      return null;
    }

    const topGoal = unsatisfiedGoals[0];

    // Check if existing plan is for a different (lower-priority) goal
    if (loop.currentPlan && loop.currentPlan.goal.id !== topGoal.id) {
      // Check if the current plan's goal still appears with equal or higher priority
      const currentPlanGoal = unsatisfiedGoals.find((g) => g.id === loop.currentPlan!.goal.id);
      if (!currentPlanGoal || currentPlanGoal.priority < topGoal.priority) {
        loop.lastReplanReason = `Higher-priority goal: ${topGoal.id} (was: ${loop.currentPlan.goal.id})`;
        this.emit('goap:plan_invalidated', {
          projectPath: config.projectPath,
          reason: loop.lastReplanReason,
        });
        loop.currentPlan = null;
        loop.currentPlanStep = 0;
      }
    }

    // Check if current plan's goal is now satisfied
    if (loop.currentPlan && areConditionsSatisfied(loop.currentPlan.goal.conditions, state)) {
      this.emit('goap:plan_completed', {
        projectPath: config.projectPath,
        plan: loop.currentPlan,
        reason: 'Goal already satisfied',
      });
      loop.currentPlan = null;
      loop.currentPlanStep = 0;
    }

    // Check if plan is exhausted (all steps done)
    if (loop.currentPlan && loop.currentPlanStep >= loop.currentPlan.actions.length) {
      loop.lastReplanReason = 'Plan steps exhausted';
      loop.currentPlan = null;
      loop.currentPlanStep = 0;
    }

    // Generate new plan if needed
    if (!loop.currentPlan) {
      // Try planning for each unsatisfied goal in priority order
      for (const goal of unsatisfiedGoals) {
        const result = planActions(state, goal, allActions);
        if (result.success && result.plan && result.plan.actions.length > 0) {
          loop.currentPlan = result.plan;
          loop.currentPlanStep = 0;
          logger.info('GOAP plan generated', {
            projectPath: config.projectPath,
            goalId: goal.id,
            steps: result.plan.actions.length,
            totalCost: result.plan.totalCost,
            statesEvaluated: result.statesEvaluated,
          });
          this.emit('goap:plan_generated', {
            projectPath: config.projectPath,
            plan: result.plan,
            statesEvaluated: result.statesEvaluated,
          });
          break;
        }
      }
    }

    // If still no plan, nothing to execute
    if (!loop.currentPlan) return null;

    // Get next action from plan
    const nextAction = loop.currentPlan.actions[loop.currentPlanStep];

    // Verify preconditions are still met
    if (!areConditionsSatisfied(nextAction.preconditions, state)) {
      loop.lastReplanReason = `Preconditions unmet for step ${loop.currentPlanStep}: ${nextAction.id}`;
      this.emit('goap:plan_invalidated', {
        projectPath: config.projectPath,
        reason: loop.lastReplanReason,
      });
      loop.currentPlan = null;
      loop.currentPlanStep = 0;
      // Try to generate a new plan immediately for this tick
      return this.planLifecycleOnce(loop, state, unsatisfiedGoals, allActions);
    }

    return nextAction;
  }

  /**
   * One-shot plan generation attempt (used when plan is invalidated mid-tick).
   * Avoids infinite recursion by not calling full planLifecycle.
   */
  private planLifecycleOnce(
    loop: RunningGOAPLoop,
    state: GOAPState,
    unsatisfiedGoals: GOAPGoal[],
    allActions: GOAPAction[]
  ): GOAPAction | null {
    for (const goal of unsatisfiedGoals) {
      const result = planActions(state, goal, allActions);
      if (result.success && result.plan && result.plan.actions.length > 0) {
        loop.currentPlan = result.plan;
        loop.currentPlanStep = 0;
        this.emit('goap:plan_generated', {
          projectPath: loop.config.projectPath,
          plan: result.plan,
          statesEvaluated: result.statesEvaluated,
        });

        const nextAction = result.plan.actions[0];
        if (areConditionsSatisfied(nextAction.preconditions, state)) {
          return nextAction;
        }
      }
    }
    return null;
  }

  // ─── Role Selection ──────────────────────────────────────────────────────

  private selectRole(loop: RunningGOAPLoop, state: GOAPState): GOAPRole {
    // Manual override takes priority
    if (loop.roleOverride) {
      const role = ROLES.find((r) => r.id === loop.roleOverride);
      if (role) {
        loop.roleSelectionReason = 'manual override';
        return role;
      }
    }

    // Auto-rotate: check roles in activationPriority order (highest first)
    const sorted = [...ROLES].sort((a, b) => b.activationPriority - a.activationPriority);
    for (const role of sorted) {
      if (role.activationConditions.length === 0) continue; // skip fallback
      if (areConditionsSatisfied(role.activationConditions, state)) {
        loop.roleSelectionReason = role.activationConditions
          .map((c) => `${c.key} ${c.operator ?? 'eq'} ${c.value}`)
          .join(', ');
        return role;
      }
    }

    // Fallback = shipper (role with no activation conditions)
    const fallback = ROLES.find((r) => r.activationConditions.length === 0);
    if (!fallback) {
      throw new Error('GOAP loop: no fallback role defined (role with empty activationConditions)');
    }
    loop.roleSelectionReason = 'default (no conditions triggered)';
    return fallback;
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
      // Use registry handler if available
      const handler = this.registry?.getHandler(action.id);
      if (handler) {
        await handler(projectPath, branchName);
      } else {
        logger.warn(`No handler registered for action: ${action.id}`);
        throw new Error(`No handler registered for GOAP action: ${action.id}`);
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

  // Keyed by projectPath only. Multi-branch support would require
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
      activeRole: loop.activeRoleId
        ? {
            id: loop.activeRoleId,
            name: ROLES.find((r) => r.id === loop.activeRoleId)?.name ?? loop.activeRoleId,
            selectedBy: loop.roleOverride ? 'manual' : 'auto',
            reason: loop.roleSelectionReason,
          }
        : null,
      roleOverride: loop.roleOverride,
      currentPlan: loop.currentPlan,
      currentPlanStep: loop.currentPlanStep,
      lastReplanReason: loop.lastReplanReason,
    };
  }

  private emit(type: EventType, payload: unknown): void {
    this.events.emit(type, payload);
  }
}
