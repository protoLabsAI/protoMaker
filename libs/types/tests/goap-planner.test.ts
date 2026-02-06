/**
 * GOAP A* Planner Tests
 *
 * Tests the regressive A* planner: plan generation, heuristic,
 * state regression, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import type { GOAPAction, GOAPGoal, GOAPState, GOAPCondition } from '../src/goap.js';
import {
  planActions,
  heuristic,
  regressState,
  hashState,
  actionContributes,
} from '../src/goap-planner.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeAction(
  id: string,
  preconditions: GOAPCondition[],
  effects: GOAPCondition[],
  cost: number
): GOAPAction {
  return { id, name: id, preconditions, effects, cost };
}

function makeGoal(id: string, conditions: GOAPCondition[]): GOAPGoal {
  return { id, name: id, conditions, priority: 10 };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('heuristic', () => {
  it('should count unsatisfied conditions', () => {
    const state: GOAPState = { a: true, b: false };
    const unsatisfied: GOAPCondition[] = [
      { key: 'a', value: true },
      { key: 'b', value: true },
      { key: 'c', value: true },
    ];
    // 'a' is satisfied, 'b' and 'c' are not
    expect(heuristic(unsatisfied, state)).toBe(2);
  });

  it('should return 0 when all conditions are satisfied', () => {
    const state: GOAPState = { a: true, b: 5 };
    const unsatisfied: GOAPCondition[] = [
      { key: 'a', value: true },
      { key: 'b', value: 5 },
    ];
    expect(heuristic(unsatisfied, state)).toBe(0);
  });
});

describe('hashState', () => {
  it('should produce deterministic hash regardless of order', () => {
    const a: GOAPCondition[] = [
      { key: 'x', value: true },
      { key: 'y', value: false },
    ];
    const b: GOAPCondition[] = [
      { key: 'y', value: false },
      { key: 'x', value: true },
    ];
    expect(hashState(a)).toBe(hashState(b));
  });

  it('should differentiate different conditions', () => {
    const a: GOAPCondition[] = [{ key: 'x', value: true }];
    const b: GOAPCondition[] = [{ key: 'x', value: false }];
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('actionContributes', () => {
  it('should return true when an effect matches an unsatisfied condition', () => {
    const action = makeAction('a1', [], [{ key: 'auto_mode_running', value: true }], 1);
    const unsatisfied: GOAPCondition[] = [{ key: 'auto_mode_running', value: true }];
    expect(actionContributes(action, unsatisfied)).toBe(true);
  });

  it('should return false when no effects match', () => {
    const action = makeAction('a1', [], [{ key: 'auto_mode_running', value: true }], 1);
    const unsatisfied: GOAPCondition[] = [{ key: 'has_failed_features', value: false }];
    expect(actionContributes(action, unsatisfied)).toBe(false);
  });
});

describe('regressState', () => {
  it('should remove satisfied conditions and add preconditions', () => {
    const unsatisfied: GOAPCondition[] = [{ key: 'auto_mode_running', value: true }];
    const action = makeAction(
      'start',
      [
        { key: 'has_backlog_work', value: true },
        { key: 'auto_mode_running', value: false },
      ],
      [{ key: 'auto_mode_running', value: true }],
      1
    );

    const result = regressState(unsatisfied, action);
    // 'auto_mode_running: true' should be removed (satisfied by effect)
    // Preconditions should be added
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.key === 'has_backlog_work')).toBeTruthy();
    expect(result.find((c) => c.key === 'auto_mode_running' && c.value === false)).toBeTruthy();
  });

  it('should not duplicate existing conditions', () => {
    const unsatisfied: GOAPCondition[] = [
      { key: 'auto_mode_running', value: true },
      { key: 'has_backlog_work', value: true }, // already in unsatisfied
    ];
    const action = makeAction(
      'start',
      [{ key: 'has_backlog_work', value: true }],
      [{ key: 'auto_mode_running', value: true }],
      1
    );

    const result = regressState(unsatisfied, action);
    // Should have has_backlog_work only once
    const backlogWork = result.filter((c) => c.key === 'has_backlog_work');
    expect(backlogWork).toHaveLength(1);
  });
});

describe('planActions', () => {
  it('should return empty plan when goal is already satisfied', () => {
    const state: GOAPState = { auto_mode_running: true };
    const goal = makeGoal('test', [{ key: 'auto_mode_running', value: true }]);
    const result = planActions(state, goal, []);

    expect(result.success).toBe(true);
    expect(result.plan!.actions).toHaveLength(0);
    expect(result.plan!.totalCost).toBe(0);
  });

  it('should find a single-step plan', () => {
    const state: GOAPState = {
      has_backlog_work: true,
      auto_mode_running: false,
    };
    const goal = makeGoal('keep_shipping', [{ key: 'auto_mode_running', value: true }]);
    const actions = [
      makeAction(
        'start_auto_mode',
        [
          { key: 'has_backlog_work', value: true },
          { key: 'auto_mode_running', value: false },
        ],
        [{ key: 'auto_mode_running', value: true }],
        1
      ),
    ];

    const result = planActions(state, goal, actions);
    expect(result.success).toBe(true);
    expect(result.plan!.actions).toHaveLength(1);
    expect(result.plan!.actions[0].id).toBe('start_auto_mode');
    expect(result.plan!.totalCost).toBe(1);
  });

  it('should find a multi-step plan', () => {
    // Goal: feature_deployed=true
    // Action chain: write_code → run_tests → deploy
    const state: GOAPState = {
      code_ready: false,
      tests_pass: false,
      feature_deployed: false,
    };

    const actions = [
      makeAction('write_code', [], [{ key: 'code_ready', value: true }], 5),
      makeAction(
        'run_tests',
        [{ key: 'code_ready', value: true }],
        [{ key: 'tests_pass', value: true }],
        3
      ),
      makeAction(
        'deploy',
        [
          { key: 'code_ready', value: true },
          { key: 'tests_pass', value: true },
        ],
        [{ key: 'feature_deployed', value: true }],
        2
      ),
    ];

    const goal = makeGoal('deploy_feature', [{ key: 'feature_deployed', value: true }]);
    const result = planActions(state, goal, actions);

    expect(result.success).toBe(true);
    expect(result.plan!.actions.length).toBeGreaterThanOrEqual(2);
    // Last action should be deploy
    const planActionIds = result.plan!.actions.map((a) => a.id);
    expect(planActionIds[planActionIds.length - 1]).toBe('deploy');
    // Must include write_code and run_tests before deploy
    expect(planActionIds).toContain('write_code');
    expect(planActionIds).toContain('run_tests');
    // write_code must come before run_tests
    expect(planActionIds.indexOf('write_code')).toBeLessThan(planActionIds.indexOf('run_tests'));
  });

  it('should pick the cheapest plan when multiple paths exist', () => {
    const state: GOAPState = { goal_done: false, ready: true };

    const actions = [
      makeAction(
        'expensive_path',
        [{ key: 'ready', value: true }],
        [{ key: 'goal_done', value: true }],
        10
      ),
      makeAction(
        'cheap_path',
        [{ key: 'ready', value: true }],
        [{ key: 'goal_done', value: true }],
        2
      ),
    ];

    const goal = makeGoal('finish', [{ key: 'goal_done', value: true }]);
    const result = planActions(state, goal, actions);

    expect(result.success).toBe(true);
    expect(result.plan!.actions[0].id).toBe('cheap_path');
    expect(result.plan!.totalCost).toBe(2);
  });

  it('should fail when no plan is possible', () => {
    const state: GOAPState = { impossible: false };
    const goal = makeGoal('unreachable', [{ key: 'impossible', value: true }]);
    // No actions can produce impossible=true
    const result = planActions(state, goal, []);

    expect(result.success).toBe(false);
    expect(result.error).toContain('exhausted');
  });

  it('should respect maxPlanCost', () => {
    const state: GOAPState = { done: false };
    const actions = [makeAction('expensive', [], [{ key: 'done', value: true }], 50)];
    const goal = makeGoal('finish', [{ key: 'done', value: true }]);

    const result = planActions(state, goal, actions, {
      maxStatesEvaluated: 1000,
      maxPlanCost: 10, // Too low for the only action
      useHeuristic: true,
    });

    expect(result.success).toBe(false);
  });

  it('should respect maxStatesEvaluated', () => {
    // Create a pathological search space
    const state: GOAPState = { a: false, b: false, c: false };
    const actions = [
      makeAction('a1', [], [{ key: 'a', value: true }], 1),
      makeAction('a2', [{ key: 'a', value: true }], [{ key: 'b', value: true }], 1),
    ];
    const goal = makeGoal('unreachable', [
      { key: 'a', value: true },
      { key: 'b', value: true },
      { key: 'c', value: true }, // No action produces c=true
    ]);

    const result = planActions(state, goal, actions, {
      maxStatesEvaluated: 5,
      maxPlanCost: 100,
      useHeuristic: true,
    });

    expect(result.success).toBe(false);
    expect(result.statesEvaluated).toBeLessThanOrEqual(6); // +1 for the check
  });

  it('should work with the GOAP dev pipeline actions', () => {
    // Simulate the real Automaker scenario
    const state: GOAPState = {
      has_backlog_work: true,
      auto_mode_running: false,
      has_failed_features: true,
      retryable_failed_count: 1,
      has_stale_features: false,
      is_idle: false,
      has_completed_features: false,
      has_blocked_ready_features: false,
      has_very_stale_features: false,
      has_chronic_failures: false,
    };

    const actions: GOAPAction[] = [
      makeAction(
        'start_auto_mode',
        [
          { key: 'has_backlog_work', value: true },
          { key: 'auto_mode_running', value: false },
        ],
        [{ key: 'auto_mode_running', value: true }],
        1
      ),
      makeAction(
        'retry_failed_feature',
        [{ key: 'retryable_failed_count', value: 0, operator: 'gt' }],
        [{ key: 'has_failed_features', value: false }],
        3
      ),
    ];

    // Test: plan to start shipping
    const shipGoal = makeGoal('keep_shipping', [{ key: 'auto_mode_running', value: true }]);
    const shipResult = planActions(state, shipGoal, actions);
    expect(shipResult.success).toBe(true);
    expect(shipResult.plan!.actions[0].id).toBe('start_auto_mode');

    // Test: plan to recover failures
    const recoveryGoal = makeGoal('recover', [{ key: 'has_failed_features', value: false }]);
    const recoveryResult = planActions(state, recoveryGoal, actions);
    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.plan!.actions[0].id).toBe('retry_failed_feature');
  });
});
