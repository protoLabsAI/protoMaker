/**
 * Goal-Oriented Action Planning (GOAP) types
 *
 * GOAP provides intelligent decision-making for autonomous agents by:
 * - Defining goals with preconditions
 * - Planning action sequences to achieve goals
 * - Evaluating world state to determine next actions
 * - Dynamically replanning when conditions change
 *
 * Inspired by GOAP architecture used in game AI (F.E.A.R., The Sims).
 */

/**
 * World state key-value pairs
 *
 * Represents the current state of the system that agents use for decision-making.
 * Examples:
 * - "prd_approved": true
 * - "features_assigned": false
 * - "pr_review_pending": 3
 */
export type GOAPState = Record<string, boolean | number | string>;

/**
 * Condition that must be met for an action or goal
 *
 * Preconditions define what must be true before an action can execute.
 * Effects define what becomes true after an action completes.
 */
export interface GOAPCondition {
  /** State key to check */
  key: string;

  /** Expected value (exact match) */
  value: boolean | number | string;

  /** Optional: Use comparison instead of exact match */
  operator?: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';
}

/**
 * Action that can be executed to change world state
 *
 * Actions are atomic operations agents can perform to progress toward goals.
 * Each action has preconditions (what must be true to execute) and effects
 * (what becomes true after execution).
 */
export interface GOAPAction {
  /** Unique action identifier */
  id: string;

  /** Human-readable action name */
  name: string;

  /** Conditions that must be met before this action can execute */
  preconditions: GOAPCondition[];

  /** State changes that occur when this action completes */
  effects: GOAPCondition[];

  /** Cost of executing this action (for planning optimization) */
  cost: number;

  /** Optional: Action-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * Goal to be achieved by an agent
 *
 * Goals define desired world states. Agents use GOAP planning to find
 * the optimal sequence of actions to satisfy goal conditions.
 */
export interface GOAPGoal {
  /** Unique goal identifier */
  id: string;

  /** Human-readable goal name */
  name: string;

  /** Conditions that must be satisfied for the goal to be achieved */
  conditions: GOAPCondition[];

  /** Goal priority (higher = more important) */
  priority: number;

  /** Estimated cost to achieve this goal (for planning) */
  estimatedCost?: number;

  /** Optional: Goal-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Role that determines goal priority weighting
 *
 * Roles represent different operational mindsets (Shipper, Janitor, Guardian).
 * The GOAP loop auto-rotates between roles based on world state conditions,
 * or a manual override can lock the loop to a specific role.
 */
export interface GOAPRole {
  /** Unique role identifier */
  id: string;
  /** Human-readable role name */
  name: string;
  /** Description of what this role focuses on */
  description: string;
  /** Goal ID → priority mapping (higher = more important) */
  goalPriorities: Record<string, number>;
  /** Conditions on world state that activate this role (auto-rotate) */
  activationConditions: GOAPCondition[];
  /** Higher = checked first during auto-rotate. Fallback role has 0. */
  activationPriority: number;
}

/**
 * Planned sequence of actions to achieve a goal
 *
 * Represents the result of GOAP planning - an ordered list of actions
 * that, when executed, should achieve the goal conditions.
 */
export interface GOAPPlan {
  /** The goal this plan achieves */
  goal: GOAPGoal;

  /** Ordered sequence of actions to execute */
  actions: GOAPAction[];

  /** Total cost of executing this plan */
  totalCost: number;

  /** Estimated time to complete (optional) */
  estimatedDuration?: number;

  /** When this plan was generated */
  createdAt: string;
}

/**
 * GOAP planner result
 *
 * Contains the generated plan or failure information.
 */
export interface GOAPPlanResult {
  /** Whether planning succeeded */
  success: boolean;

  /** Generated plan (if successful) */
  plan?: GOAPPlan;

  /** Failure reason (if unsuccessful) */
  error?: string;

  /** Number of states evaluated during planning */
  statesEvaluated?: number;
}

/**
 * GOAP planner configuration
 */
export interface GOAPPlannerConfig {
  /** Maximum states to evaluate before giving up */
  maxStatesEvaluated: number;

  /** Maximum plan cost to consider (prune expensive plans) */
  maxPlanCost: number;

  /** Whether to use heuristic search (A*) vs exhaustive search */
  useHeuristic: boolean;
}

/**
 * Default GOAP planner configuration
 */
export const DEFAULT_GOAP_PLANNER_CONFIG: GOAPPlannerConfig = {
  maxStatesEvaluated: 1000,
  maxPlanCost: 100,
  useHeuristic: true,
};

/**
 * Extended action definition with metadata for the action registry.
 * Separates declaration (pure data for planner) from handler (impure, has services).
 */
export interface GOAPActionDefinition extends GOAPAction {
  /** Human-readable description of what this action does */
  description: string;
  /** Category for grouping in UI and logging */
  category: 'auto-mode' | 'failure-recovery' | 'wip-management' | 'pipeline' | 'maintenance';
}

/**
 * Helper: Check if a condition is satisfied in the given state
 */
export function isConditionSatisfied(condition: GOAPCondition, state: GOAPState): boolean {
  const actualValue = state[condition.key];
  const expectedValue = condition.value;

  if (actualValue === undefined) {
    return false;
  }

  const operator = condition.operator || 'eq';

  switch (operator) {
    case 'eq':
      return actualValue === expectedValue;
    case 'ne':
      return actualValue !== expectedValue;
    case 'gt':
      return (
        typeof actualValue === 'number' &&
        typeof expectedValue === 'number' &&
        actualValue > expectedValue
      );
    case 'lt':
      return (
        typeof actualValue === 'number' &&
        typeof expectedValue === 'number' &&
        actualValue < expectedValue
      );
    case 'gte':
      return (
        typeof actualValue === 'number' &&
        typeof expectedValue === 'number' &&
        actualValue >= expectedValue
      );
    case 'lte':
      return (
        typeof actualValue === 'number' &&
        typeof expectedValue === 'number' &&
        actualValue <= expectedValue
      );
    default:
      return false;
  }
}

/**
 * Helper: Check if all conditions are satisfied in the given state
 */
export function areConditionsSatisfied(conditions: GOAPCondition[], state: GOAPState): boolean {
  return conditions.every((condition) => isConditionSatisfied(condition, state));
}

/**
 * Helper: Apply action effects to state (create new state object)
 */
export function applyEffects(state: GOAPState, effects: GOAPCondition[]): GOAPState {
  const newState = { ...state };

  for (const effect of effects) {
    newState[effect.key] = effect.value;
  }

  return newState;
}

/**
 * Snapshot of world state at a point in time
 */
export interface WorldStateSnapshot {
  /** Unique snapshot identifier */
  id: string;
  /** Project path this state belongs to */
  projectPath: string;
  /** The computed world state */
  state: GOAPState;
  /** When this snapshot was captured (ISO 8601) */
  capturedAt: string;
  /** How long evaluation took in milliseconds */
  evaluationDurationMs: number;
}

/**
 * Result of executing a GOAP action
 */
export interface GOAPActionResult {
  /** The action that was executed */
  action: GOAPAction;
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if the action failed */
  error?: string;
  /** Effects that were applied (if successful) */
  appliedEffects?: GOAPCondition[];
  /** When execution started (ISO 8601) */
  startedAt: string;
  /** When execution completed (ISO 8601) */
  completedAt: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Configuration for a GOAP brain loop
 */
export interface GOAPLoopConfig {
  /** Project path to manage */
  projectPath: string;
  /** Branch name for worktree scoping (null for main) */
  branchName: string | null;
  /** Milliseconds between ticks (default: 30000) */
  tickIntervalMs: number;
  /** Max consecutive errors before auto-pause (default: 5) */
  maxConsecutiveErrors: number;
  /** Whether this loop is enabled */
  enabled: boolean;
  /** Max action history entries to keep (default: 100) */
  maxActionHistorySize: number;
}

/**
 * Default GOAP loop configuration
 */
export const DEFAULT_GOAP_LOOP_CONFIG: Omit<GOAPLoopConfig, 'projectPath'> = {
  branchName: null,
  tickIntervalMs: 30000,
  maxConsecutiveErrors: 5,
  enabled: true,
  maxActionHistorySize: 100,
};

/**
 * Status of a running GOAP brain loop
 */
export interface GOAPLoopStatus {
  /** Project path being managed */
  projectPath: string;
  /** Branch name for worktree scoping */
  branchName: string | null;
  /** Whether the loop is currently running */
  isRunning: boolean;
  /** Whether the loop is paused */
  isPaused: boolean;
  /** Number of ticks completed */
  tickCount: number;
  /** Last captured world state */
  lastWorldState: WorldStateSnapshot | null;
  /** Goals that are not yet satisfied */
  unsatisfiedGoals: GOAPGoal[];
  /** Actions whose preconditions are met */
  availableActions: GOAPAction[];
  /** Last action result */
  lastAction: GOAPActionResult | null;
  /** History of action results */
  actionHistory: GOAPActionResult[];
  /** Number of consecutive errors */
  consecutiveErrors: number;
  /** Last error message */
  lastError?: string;
  /** When the loop was started (ISO 8601) */
  startedAt: string;
  /** When the last tick ran (ISO 8601) */
  lastTickAt?: string;
  /** Currently active role (determines goal priorities) */
  activeRole: { id: string; name: string; selectedBy: 'auto' | 'manual'; reason?: string } | null;
  /** Whether a manual role override is set (null = auto-rotate) */
  roleOverride: string | null;
  /** Current multi-step plan being executed (null if no plan) */
  currentPlan: GOAPPlan | null;
  /** Index of the current step being executed in the plan (0-based) */
  currentPlanStep: number;
  /** Reason the last plan was invalidated/regenerated */
  lastReplanReason?: string;
}

/**
 * Example GOAP goals for the AI dev team POC
 */
export const EXAMPLE_GOAP_GOALS = {
  /** PM Agent: Understand user request */
  USER_REQUEST_UNDERSTOOD: {
    id: 'user_request_understood',
    name: 'User Request Understood',
    conditions: [
      { key: 'user_requirements_gathered', value: true },
      { key: 'scope_confirmed', value: true },
    ],
    priority: 10,
    estimatedCost: 5,
  } as GOAPGoal,

  /** PM Agent: PRD approved */
  PRD_APPROVED: {
    id: 'prd_approved',
    name: 'PRD Approved',
    conditions: [
      { key: 'research_completed', value: true },
      { key: 'prd_drafted', value: true },
      { key: 'user_approved_prd', value: true },
    ],
    priority: 9,
    estimatedCost: 15,
  } as GOAPGoal,

  /** EM Agent: Features assigned */
  FEATURES_ASSIGNED: {
    id: 'features_assigned',
    name: 'Features Assigned',
    conditions: [
      { key: 'linear_project_created', value: true },
      { key: 'phases_analyzed', value: true },
      { key: 'roles_assigned', value: true },
    ],
    priority: 8,
    estimatedCost: 10,
  } as GOAPGoal,

  /** Engineer Agent: Feature implemented */
  FEATURE_IMPLEMENTED: {
    id: 'feature_implemented',
    name: 'Feature Implemented',
    conditions: [
      { key: 'feature_claimed', value: true },
      { key: 'code_written', value: true },
      { key: 'tests_passing', value: true },
      { key: 'pr_created', value: true },
    ],
    priority: 7,
    estimatedCost: 20,
  } as GOAPGoal,

  /** QA Agent: PR quality verified */
  PR_QUALITY_VERIFIED: {
    id: 'pr_quality_verified',
    name: 'PR Quality Verified',
    conditions: [
      { key: 'pr_analyzed', value: true },
      { key: 'tests_run', value: true },
      { key: 'review_posted', value: true },
    ],
    priority: 6,
    estimatedCost: 8,
  } as GOAPGoal,

  /** Docs Agent: Documentation current */
  DOCS_CURRENT: {
    id: 'docs_current',
    name: 'Documentation Current',
    conditions: [
      { key: 'affected_docs_identified', value: true },
      { key: 'docs_updated', value: true },
      { key: 'changeset_created', value: true },
    ],
    priority: 5,
    estimatedCost: 7,
  } as GOAPGoal,

  /** EM Agent: Release published */
  RELEASE_PUBLISHED: {
    id: 'release_published',
    name: 'Release Published',
    conditions: [
      { key: 'all_prs_merged', value: true },
      { key: 'version_bumped', value: true },
      { key: 'changelog_generated', value: true },
      { key: 'epic_merged', value: true },
    ],
    priority: 4,
    estimatedCost: 12,
  } as GOAPGoal,

  /** Idle: Maximize productivity */
  MAXIMIZE_PRODUCTIVITY: {
    id: 'maximize_productivity',
    name: 'Maximize Productivity',
    conditions: [
      { key: 'blocking_prs_reviewed', value: true },
      { key: 'own_prs_updated', value: true },
    ],
    priority: 3,
    estimatedCost: 5,
  } as GOAPGoal,
};

/**
 * Example GOAP actions for the AI dev team POC
 */
export const EXAMPLE_GOAP_ACTIONS = {
  /** PM: Detect Discord message */
  DETECT_MESSAGE: {
    id: 'detect_message',
    name: 'Detect Discord Message',
    preconditions: [{ key: 'discord_monitoring_active', value: true }],
    effects: [{ key: 'message_detected', value: true }],
    cost: 1,
  } as GOAPAction,

  /** PM: Ask clarifying questions */
  ASK_QUESTIONS: {
    id: 'ask_questions',
    name: 'Ask Clarifying Questions',
    preconditions: [{ key: 'message_detected', value: true }],
    effects: [{ key: 'user_requirements_gathered', value: true }],
    cost: 3,
  } as GOAPAction,

  /** PM: Confirm scope */
  CONFIRM_SCOPE: {
    id: 'confirm_scope',
    name: 'Confirm Scope',
    preconditions: [{ key: 'user_requirements_gathered', value: true }],
    effects: [{ key: 'scope_confirmed', value: true }],
    cost: 2,
  } as GOAPAction,

  /** PM: Conduct research */
  CONDUCT_RESEARCH: {
    id: 'conduct_research',
    name: 'Conduct Codebase Research',
    preconditions: [{ key: 'scope_confirmed', value: true }],
    effects: [{ key: 'research_completed', value: true }],
    cost: 5,
  } as GOAPAction,

  /** PM: Draft PRD */
  DRAFT_PRD: {
    id: 'draft_prd',
    name: 'Draft SPARC PRD',
    preconditions: [{ key: 'research_completed', value: true }],
    effects: [{ key: 'prd_drafted', value: true }],
    cost: 8,
  } as GOAPAction,

  /** PM: Get PRD approval */
  GET_PRD_APPROVAL: {
    id: 'get_prd_approval',
    name: 'Get User PRD Approval',
    preconditions: [{ key: 'prd_drafted', value: true }],
    effects: [{ key: 'user_approved_prd', value: true }],
    cost: 3,
  } as GOAPAction,

  /** Engineer: Claim feature */
  CLAIM_FEATURE: {
    id: 'claim_feature',
    name: 'Claim Linear Issue',
    preconditions: [{ key: 'feature_available', value: true }],
    effects: [{ key: 'feature_claimed', value: true }],
    cost: 1,
  } as GOAPAction,

  /** Engineer: Write code */
  WRITE_CODE: {
    id: 'write_code',
    name: 'Implement Feature',
    preconditions: [{ key: 'feature_claimed', value: true }],
    effects: [{ key: 'code_written', value: true }],
    cost: 15,
  } as GOAPAction,

  /** Engineer: Run tests */
  RUN_TESTS: {
    id: 'run_tests',
    name: 'Run Test Suite',
    preconditions: [{ key: 'code_written', value: true }],
    effects: [{ key: 'tests_passing', value: true }],
    cost: 3,
  } as GOAPAction,

  /** Engineer: Create PR */
  CREATE_PR: {
    id: 'create_pr',
    name: 'Create Pull Request',
    preconditions: [
      { key: 'code_written', value: true },
      { key: 'tests_passing', value: true },
    ],
    effects: [{ key: 'pr_created', value: true }],
    cost: 2,
  } as GOAPAction,

  /** QA: Review PR */
  REVIEW_PR: {
    id: 'review_pr',
    name: 'Review Pull Request',
    preconditions: [{ key: 'pr_available', value: true }],
    effects: [
      { key: 'pr_analyzed', value: true },
      { key: 'tests_run', value: true },
      { key: 'review_posted', value: true },
    ],
    cost: 7,
  } as GOAPAction,
};
