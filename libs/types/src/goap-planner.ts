/**
 * GOAP A* Planner — Regressive (backward) search
 *
 * Starts from goal conditions, works backward finding which actions could
 * produce them. Pure function module with zero external deps — operates
 * entirely on types from ./goap.ts.
 *
 * Algorithm:
 * 1. Build goal node from unsatisfied goal conditions
 * 2. Open set (sorted by f = g + h), closed set (state hashes)
 * 3. Pop lowest-f node. If its unsatisfied conditions are met by current world state → reconstruct plan
 * 4. For each action whose effects contribute to this node's needs, regress: remove effects, add preconditions → new node
 * 5. Prune if g > maxPlanCost or statesEvaluated > maxStatesEvaluated
 */

import type {
  GOAPState,
  GOAPGoal,
  GOAPAction,
  GOAPPlan,
  GOAPPlanResult,
  GOAPPlannerConfig,
  GOAPCondition,
} from './goap.js';
import { DEFAULT_GOAP_PLANNER_CONFIG, isConditionSatisfied } from './goap.js';

// ─── Internal types ──────────────────────────────────────────────────────────

interface PlannerNode {
  /** Conditions that still need to be satisfied (working backward from goal) */
  unsatisfied: GOAPCondition[];
  /** Actions accumulated so far (in reverse order — goal→start) */
  actions: GOAPAction[];
  /** Accumulated cost (g) */
  g: number;
  /** Heuristic estimate (h) */
  h: number;
  /** f = g + h */
  f: number;
}

// ─── Heuristic ───────────────────────────────────────────────────────────────

/**
 * Admissible heuristic: count unsatisfied conditions.
 * Each unsatisfied condition needs at least one action, so this never overestimates.
 */
export function heuristic(unsatisfied: GOAPCondition[], currentState: GOAPState): number {
  let count = 0;
  for (const cond of unsatisfied) {
    if (!isConditionSatisfied(cond, currentState)) {
      count++;
    }
  }
  return count;
}

// ─── State hashing ───────────────────────────────────────────────────────────

/**
 * Create a deterministic hash of unsatisfied conditions for the closed set.
 * Sorted by key to ensure consistent hashing regardless of insertion order.
 */
export function hashState(unsatisfied: GOAPCondition[]): string {
  return unsatisfied
    .map((c) => `${c.key}:${c.operator ?? 'eq'}:${c.value}`)
    .sort()
    .join('|');
}

// ─── Action contribution check ──────────────────────────────────────────────

/**
 * Check if an action's effects contribute to satisfying any of the unsatisfied conditions.
 * An effect contributes when its key+value matches a condition's key+value (for 'eq' operator).
 */
export function actionContributes(action: GOAPAction, unsatisfied: GOAPCondition[]): boolean {
  return action.effects.some((effect) =>
    unsatisfied.some(
      (cond) =>
        cond.key === effect.key &&
        (cond.operator === undefined || cond.operator === 'eq') &&
        cond.value === effect.value
    )
  );
}

// ─── State regression ────────────────────────────────────────────────────────

/**
 * Regress the unsatisfied conditions through an action:
 * 1. Remove conditions that this action's effects satisfy
 * 2. Add this action's preconditions (if not already in the set)
 *
 * Returns the new set of unsatisfied conditions after regression.
 */
export function regressState(unsatisfied: GOAPCondition[], action: GOAPAction): GOAPCondition[] {
  // Remove conditions satisfied by this action's effects
  const remaining = unsatisfied.filter(
    (cond) =>
      !action.effects.some(
        (effect) =>
          effect.key === cond.key &&
          (cond.operator === undefined || cond.operator === 'eq') &&
          effect.value === cond.value
      )
  );

  // Add preconditions that aren't already in the set
  const existingKeys = new Set(remaining.map((c) => `${c.key}:${c.operator ?? 'eq'}:${c.value}`));
  for (const pre of action.preconditions) {
    const key = `${pre.key}:${pre.operator ?? 'eq'}:${pre.value}`;
    if (!existingKeys.has(key)) {
      remaining.push(pre);
      existingKeys.add(key);
    }
  }

  return remaining;
}

// ─── A* Planner ──────────────────────────────────────────────────────────────

/**
 * Plan a sequence of actions to achieve a goal from the current world state.
 *
 * Uses regressive (backward) A* search:
 * - Starts from goal conditions
 * - Works backward finding which actions produce needed conditions
 * - Returns the action sequence in forward (execution) order
 */
export function planActions(
  currentState: GOAPState,
  goal: GOAPGoal,
  actions: GOAPAction[],
  config: GOAPPlannerConfig = DEFAULT_GOAP_PLANNER_CONFIG
): GOAPPlanResult {
  // Find goal conditions not already satisfied
  const initialUnsatisfied = goal.conditions.filter(
    (cond) => !isConditionSatisfied(cond, currentState)
  );

  // Goal already satisfied
  if (initialUnsatisfied.length === 0) {
    return {
      success: true,
      plan: {
        goal,
        actions: [],
        totalCost: 0,
        createdAt: new Date().toISOString(),
      },
      statesEvaluated: 0,
    };
  }

  const h0 = config.useHeuristic ? heuristic(initialUnsatisfied, currentState) : 0;
  const startNode: PlannerNode = {
    unsatisfied: initialUnsatisfied,
    actions: [],
    g: 0,
    h: h0,
    f: h0,
  };

  // Open set — kept sorted by f (we insert in order)
  const open: PlannerNode[] = [startNode];
  const closed = new Set<string>();
  let statesEvaluated = 0;

  while (open.length > 0) {
    // Pop node with lowest f
    const current = open.shift()!;
    statesEvaluated++;

    if (statesEvaluated >= config.maxStatesEvaluated) {
      return {
        success: false,
        error: `Max states evaluated (${config.maxStatesEvaluated}) exceeded`,
        statesEvaluated,
      };
    }

    // Check if all remaining unsatisfied conditions are met by current world state
    const allSatisfied = current.unsatisfied.every((cond) =>
      isConditionSatisfied(cond, currentState)
    );

    if (allSatisfied) {
      // Reconstruct plan — actions were collected in reverse (goal→start), so reverse for execution order
      const forwardActions = [...current.actions].reverse();
      return {
        success: true,
        plan: {
          goal,
          actions: forwardActions,
          totalCost: current.g,
          createdAt: new Date().toISOString(),
        },
        statesEvaluated,
      };
    }

    // Add to closed set
    const stateHash = hashState(current.unsatisfied);
    if (closed.has(stateHash)) continue;
    closed.add(stateHash);

    // Expand: try each action that contributes to satisfying unsatisfied conditions
    for (const action of actions) {
      if (!actionContributes(action, current.unsatisfied)) continue;

      const newG = current.g + action.cost;
      if (newG > config.maxPlanCost) continue; // Prune expensive paths

      const newUnsatisfied = regressState(current.unsatisfied, action);
      const newHash = hashState(newUnsatisfied);
      if (closed.has(newHash)) continue;

      const newH = config.useHeuristic ? heuristic(newUnsatisfied, currentState) : 0;
      const newNode: PlannerNode = {
        unsatisfied: newUnsatisfied,
        actions: [...current.actions, action],
        g: newG,
        h: newH,
        f: newG + newH,
      };

      // Insert into open set maintaining sort by f
      const insertIdx = open.findIndex((n) => n.f > newNode.f);
      if (insertIdx === -1) {
        open.push(newNode);
      } else {
        open.splice(insertIdx, 0, newNode);
      }
    }
  }

  return {
    success: false,
    error: 'No plan found — search space exhausted',
    statesEvaluated,
  };
}
