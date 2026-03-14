/**
 * Lead Engineer Service types
 *
 * The Lead Engineer is the production-phase nerve center.
 * It orchestrates auto-mode, reacts to events with fast-path rules,
 * and wraps up projects with retro + improvement tickets.
 */

import type { FeatureStatus } from './feature.js';

// ────────────────────────── Snapshots ──────────────────────────

/** Per-feature state as seen by the Lead Engineer */
export interface LeadFeatureSnapshot {
  id: string;
  title?: string;
  status: FeatureStatus | string;
  branchName?: string;
  prNumber?: number;
  prUrl?: string;
  prCreatedAt?: string;
  prMergedAt?: string;
  costUsd?: number;
  failureCount?: number;
  dependencies?: string[];
  epicId?: string;
  isEpic?: boolean;
  isFoundation?: boolean;
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  startedAt?: string;
  completedAt?: string;
}

/** Running agent snapshot */
export interface LeadAgentSnapshot {
  featureId: string;
  startTime: string;
  branch?: string;
}

/** Open PR snapshot */
export interface LeadPRSnapshot {
  featureId: string;
  prNumber: number;
  prUrl?: string;
  prCreatedAt?: string;
  autoMergeEnabled?: boolean;
  unresolvedThreads?: number;
  reviewState?: 'pending' | 'approved' | 'changes_requested';
  ciStatus?: 'pending' | 'passing' | 'failing';
  isRemediating?: boolean;
  remediationCount?: number;
}

/** Milestone progress snapshot */
export interface LeadMilestoneSnapshot {
  slug: string;
  title: string;
  totalPhases: number;
  completedPhases: number;
}

// ────────────────────────── World State Domains ──────────────────────────

/**
 * Domain classification for world state types.
 * Each domain owns a distinct slice of operational knowledge.
 */
export enum WorldStateDomain {
  /** Ava's domain: strategic context, cross-project rollups, team health */
  Strategic = 'strategic',
  /** Project Manager's domain: projects, milestones, ceremonies, timelines */
  Project = 'project',
  /** Lead Engineer's domain: features, agents, PR status, build state */
  Engineering = 'engineering',
}

/**
 * Ava's world state — strategic context, cross-project rollups, team health.
 */
export interface AvaWorldState {
  /** Domain tag */
  domain: WorldStateDomain.Strategic;

  /** ISO timestamp of last update */
  updatedAt: string;

  /** High-level project health rollup (projectSlug → health summary) */
  projectRollups: Record<
    string,
    {
      status: string;
      openFeatures: number;
      blockers: number;
      lastActivityAt?: string;
    }
  >;

  /** Team health signals */
  teamHealth: {
    activeAgents: number;
    escalations: number;
    errorBudgetExhausted: boolean;
  };

  /** Strategic notes or directives from the CoS layer */
  strategicContext?: string;
}

/**
 * Project Manager's world state — projects, milestones, ceremonies, timelines.
 */
export interface PMWorldState {
  /** Domain tag */
  domain: WorldStateDomain.Project;

  /** ISO timestamp of last update */
  updatedAt: string;

  /** Active projects (projectSlug → summary) */
  projects: Record<
    string,
    {
      status: string;
      phase: string;
      milestoneCount: number;
      completedMilestones: number;
    }
  >;

  /** Milestone progress (milestoneSlug → snapshot) */
  milestones: Record<
    string,
    {
      title: string;
      totalPhases: number;
      completedPhases: number;
      dueAt?: string;
    }
  >;

  /** Upcoming ceremony dates (ceremonyType → ISO datetime) */
  ceremonies: Record<string, string>;

  /** Timeline entries for active projects */
  upcomingDeadlines: Array<{
    projectSlug: string;
    label: string;
    dueAt: string;
  }>;
}

/**
 * Lead Engineer's world state — features, agents, PR status, build state.
 * LeadWorldState extends this for backward compatibility during migration.
 */
export interface LEWorldState {
  /** Domain tag */
  domain: WorldStateDomain.Engineering;

  /** Project path on disk */
  projectPath: string;

  /** Short project identifier */
  projectSlug: string;

  /** ISO timestamp of last update */
  updatedAt: string;

  /** Board counts by status */
  boardCounts: Record<string, number>;

  /** Per-feature state map (featureId → snapshot) */
  features: Record<string, LeadFeatureSnapshot>;

  /** Currently running agents */
  agents: LeadAgentSnapshot[];

  /** Open PRs */
  openPRs: LeadPRSnapshot[];

  /** Milestone progress */
  milestones: LeadMilestoneSnapshot[];

  /** Aggregate metrics */
  metrics: {
    totalFeatures: number;
    completedFeatures: number;
    totalCostUsd: number;
    avgCycleTimeMs?: number;
  };

  /** Auto-mode running? */
  autoModeRunning: boolean;

  /** Max concurrency for auto-mode */
  maxConcurrency: number;

  /**
   * Whether the error budget is currently exhausted.
   * When true, auto-mode should only pick up features tagged as bug-fix.
   */
  errorBudgetExhausted?: boolean;
}

// ────────────────────────── World State ──────────────────────────

/**
 * Comprehensive state of a managed project.
 * Extends LEWorldState for backward compatibility during migration to domain-typed world states.
 */
export interface LeadWorldState extends Omit<LEWorldState, 'domain'> {}

// ────────────────────────── Rule Actions ──────────────────────────

/** Discriminated union of actions a rule can emit */
export type LeadRuleAction =
  | { type: 'move_feature'; featureId: string; toStatus: FeatureStatus }
  | { type: 'reset_feature'; featureId: string; reason: string }
  | { type: 'unblock_feature'; featureId: string }
  | { type: 'enable_auto_merge'; featureId: string; prNumber: number }
  | { type: 'resolve_threads'; featureId: string; prNumber: number }
  | { type: 'resolve_threads_direct'; featureId: string; prNumber: number }
  | { type: 'restart_auto_mode'; projectPath: string; maxConcurrency?: number }
  | { type: 'stop_agent'; featureId: string }
  | { type: 'send_agent_message'; featureId: string; message: string }
  | { type: 'abort_and_resume'; featureId: string; resumePrompt: string }
  | { type: 'post_discord'; channelId: string; message: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'escalate_llm'; reason: string; context: Record<string, unknown> }
  | { type: 'project_completing' }
  | {
      type: 'update_feature';
      featureId: string;
      updates: {
        description?: string;
        statusChangeReason?: string;
        failureCount?: number;
        awaitingGatePhase?: null;
      };
    }
  | { type: 'rollback_feature'; featureId: string; projectPath: string; reason: string };

// ────────────────────────── Fast-Path Rules ──────────────────────────

/** A fast-path rule: pure function, no LLM, no service imports */
export interface LeadFastPathRule {
  /** Unique rule name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Event types that trigger this rule */
  triggers: string[];
  /** Pure function: given world state + event, return actions (or empty array) */
  evaluate: (
    worldState: LeadWorldState,
    eventType: string,
    eventPayload: unknown
  ) => LeadRuleAction[];
}

// ────────────────────────── Session ──────────────────────────

/** Flow state machine for a managed project */
export type LeadEngineerFlowState = 'idle' | 'running' | 'completing' | 'stopped';

/** Per-project session maintained by the Lead Engineer */
export interface LeadEngineerSession {
  projectPath: string;
  projectSlug: string;
  flowState: LeadEngineerFlowState;
  worldState: LeadWorldState;
  startedAt: string;
  stoppedAt?: string;

  /** Rolling log of rule evaluations (capped at 200) */
  ruleLog: LeadRuleLogEntry[];

  /** Count of actions taken since session start */
  actionsTaken: number;
}

/** Entry in the rule evaluation log */
export interface LeadRuleLogEntry {
  timestamp: string;
  ruleName: string;
  eventType: string;
  actions: LeadRuleAction[];
}

// ────────────────────────── State Machine ──────────────────────────

/**
 * Feature lifecycle states managed by the Lead Engineer
 *
 * Flow:
 * INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE
 *
 * Short-circuits:
 * - Any state can → ESCALATE (on critical errors or max retries)
 * - ESCALATE → [appropriate state] (after human intervention)
 */
export enum FeatureState {
  /** Initial state: feature created, awaiting intake */
  INTAKE = 'INTAKE',
  /** Planning phase: requirements analysis, spec generation */
  PLAN = 'PLAN',
  /** Execution phase: implementation work in progress */
  EXECUTE = 'EXECUTE',
  /** Review phase: PR created, under review */
  REVIEW = 'REVIEW',
  /** Merge phase: PR approved, CI passing, ready to merge */
  MERGE = 'MERGE',
  /** Deploy phase: merged to main, deployment in progress */
  DEPLOY = 'DEPLOY',
  /** Terminal state: feature fully deployed and verified */
  DONE = 'DONE',
  /** Escalation state: blocked, needs human intervention */
  ESCALATE = 'ESCALATE',
}

/** Valid state transitions in the state machine */
export interface StateTransition {
  from: FeatureState;
  to: FeatureState;
  /** ISO 8601 timestamp of the transition */
  timestamp: string;
  /** Optional reason for the transition */
  reason?: string;
  /** Optional automation/agent that triggered this transition */
  triggeredBy?: string;
}

/**
 * Short-circuit conditions that bypass normal flow
 * These are checked before each state transition
 */
export interface ShortCircuitCondition {
  /** Condition name for logging/debugging */
  name: string;
  /** Predicate that evaluates to true if short-circuit should activate */
  evaluate: (context: FeatureStateContext) => boolean;
  /** Target state to transition to if condition is met */
  targetState: FeatureState;
  /** Reason message for the short-circuit */
  reason: string;
}

/** Context information used by state machine logic */
export interface FeatureStateContext {
  featureId: string;
  currentState: FeatureState;
  feature: LeadFeatureSnapshot;
  worldState: LeadWorldState;
  /** Number of consecutive failures in current state */
  failureCount: number;
  /** Maximum allowed failures before escalation */
  maxFailures: number;
  /** Whether auto-mode is running */
  autoModeActive: boolean;
}

/**
 * Triggers that cause escalation to ESCALATE state
 * These are evaluated at each state to determine if escalation is needed
 */
export interface EscalationTrigger {
  /** Trigger name */
  name: string;
  /** Predicate that evaluates if escalation should occur */
  shouldEscalate: (context: FeatureStateContext) => boolean;
  /** Severity level (info, warn, error, critical) */
  severity: 'info' | 'warn' | 'error' | 'critical';
  /** Human-readable reason for escalation */
  reason: string;
}

/**
 * Persona assignments for different state machine phases
 * Maps personas to their preferred states for autonomous work
 */
export interface PersonaAssignment {
  /** Agent persona/role name */
  persona: string;
  /** States this persona can handle autonomously */
  handledStates: FeatureState[];
  /** Model preference for this persona */
  preferredModel?: string;
  /** Maximum concurrent features this persona can handle */
  maxConcurrency?: number;
}

// ────────────────────────── Pipeline Result ──────────────────────────

/**
 * Structured result returned by LeadEngineerService.process()
 * Captures the outcome, final state, and optional retry/failure metadata.
 */
export interface PipelineResult {
  /** High-level outcome of the pipeline run */
  outcome: 'completed' | 'escalated' | 'blocked' | 'needs_retry';
  /** The final state the feature was in when processing ended */
  finalState: FeatureState;
  /** Human-readable reason for this outcome */
  reason?: string;
  /** Cumulative failure count at the time processing ended */
  failureCount?: number;
  /** Suggested delay before retrying, in milliseconds */
  retryAfterMs?: number;
}

// ────────────────────────── Phase Handoffs ──────────────────────────

/**
 * Lead Engineer Service interface
 * Core orchestration service for managing feature lifecycle
 */
export interface LeadEngineerService {
  /**
   * Start managing a project (initializes world state, starts event listeners)
   */
  startProject(projectPath: string): Promise<LeadEngineerSession>;

  /**
   * Stop managing a project (cleanup, persist state)
   */
  stopProject(projectPath: string): Promise<void>;

  /**
   * Get current session for a project
   */
  getSession(projectPath: string): LeadEngineerSession | null;

  /**
   * Transition a feature to a new state
   */
  transitionFeature(
    featureId: string,
    toState: FeatureState,
    reason?: string
  ): Promise<StateTransition>;

  /**
   * Evaluate short-circuit conditions for a feature
   */
  evaluateShortCircuits(featureId: string): Promise<ShortCircuitCondition | null>;

  /**
   * Evaluate escalation triggers for a feature
   */
  evaluateEscalation(featureId: string): Promise<EscalationTrigger | null>;

  /**
   * Assign appropriate persona to handle a feature in a given state
   */
  assignPersona(featureId: string, state: FeatureState): Promise<PersonaAssignment | null>;

  /**
   * Execute fast-path rules in response to an event
   */
  executeRules(eventType: string, eventPayload: unknown): Promise<LeadRuleAction[]>;

  /**
   * Update world state from current system state
   */
  refreshWorldState(projectPath: string): Promise<LeadWorldState>;
}

// ────────────────────────── Structured Plan ──────────────────────────

/** A single acceptance criterion for a feature plan */
export interface AcceptanceCriterion {
  /** Human-readable description of what must be true for acceptance */
  description: string;
  /** Optional verification command to confirm criterion is met */
  verifyCommand?: string;
}

/** A rule that defines acceptable deviations from the original plan */
export interface DeviationRule {
  /** Description of what kind of deviation is allowed */
  condition: string;
  /** How to handle or adapt when this deviation occurs */
  action: string;
}

/** A single implementation task within a structured plan */
export interface PlanTask {
  /** Short title describing this task */
  title: string;
  /** Detailed description of what needs to be done */
  description: string;
  /** Files to create or modify for this task */
  files: string[];
  /** Shell command to verify this task is complete */
  verifyCommand?: string;
}

/**
 * Structured implementation plan produced by PlanProcessor.
 * Contains machine-parseable goal, acceptance criteria, tasks, and deviation rules.
 */
export interface StructuredPlan {
  /** High-level goal statement for the feature */
  goal: string;
  /** Ordered list of acceptance criteria that must be satisfied */
  acceptanceCriteria: AcceptanceCriterion[];
  /** Ordered list of implementation tasks */
  tasks: PlanTask[];
  /** Rules for handling deviations from the plan */
  deviationRules: DeviationRule[];
}

// ────────────────────────── Phase Handoff ──────────────────────────

/**
 * Structured document capturing the state at the end of each Lead Engineer phase.
 * Stored at .automaker/features/{featureId}/handoff-{phase}.json
 */
export interface PhaseHandoff {
  /** The phase that just completed */
  phase: string;
  /** Human-readable summary of what was accomplished */
  summary: string;
  /** New discoveries made during this phase */
  discoveries: string[];
  /** Files that were created or modified */
  modifiedFiles: string[];
  /** Questions that remain open or need clarification */
  outstandingQuestions: string[];
  /** Scope boundaries — things explicitly excluded */
  scopeLimits: string[];
  /** Test coverage status */
  testCoverage: string;
  /** Agent's confidence verdict for the phase output */
  verdict: 'APPROVE' | 'WARN' | 'BLOCK';
  /** ISO timestamp when this handoff was created */
  createdAt: string;
  /** Structured plan from PlanProcessor, carried through PLAN-to-EXECUTE transition */
  structuredPlan?: StructuredPlan;
}
