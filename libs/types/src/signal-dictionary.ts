/**
 * Signal Dictionary Types — Portfolio Attention Engine
 *
 * Named signals with configurable thresholds that auto-create ActionableItems
 * when conditions cross defined boundaries. See docs/internal/portfolio-philosophy.md
 * for the full operating model.
 *
 * Signal taxonomy:
 *   Exception — will get worse if you wait (Ava interrupts immediately)
 *   Decision  — needs human judgment but can wait for next ritual
 *   Information — useful context but requires no action
 */

// ── Signal Category ──────────────────────────────────────────────────────────

/** The attention category a signal resolves to based on its current value. */
export type SignalCategory = 'exception' | 'decision' | 'information';

// ── Signal Names ─────────────────────────────────────────────────────────────

/** Well-known signal names from the default signal dictionary. */
export type SignalName =
  | 'stale-review'
  | 'stuck-agent'
  | 'remediation-loop'
  | 'wip-overload'
  | 'error-budget'
  | 'cost-cap'
  | 'project-drift'
  | 'ci-saturation'
  | 'agent-failure-storm';

// ── Signal Definition ────────────────────────────────────────────────────────

/**
 * A threshold boundary that determines when a signal escalates.
 * When the measured value crosses this threshold, the signal is promoted
 * to the corresponding category.
 */
export interface SignalThreshold {
  /** The value at which this threshold activates. */
  value: number;
  /** Human-readable description of what this threshold means. */
  description: string;
}

/**
 * A named signal in the dictionary. Defines what to watch for,
 * when to escalate, and what Ava does automatically.
 */
export interface SignalDefinition {
  /** Unique signal identifier (e.g., 'stale-review'). */
  name: SignalName | string;
  /** Human-readable description shown in UI and decision briefs. */
  description: string;
  /** Whether this signal is actively evaluated. */
  enabled: boolean;
  /** Minimum milliseconds between duplicate signals for the same context key. */
  cooldownMs: number;
  /** Unit for threshold values (e.g., 'minutes', 'count', 'ratio', 'percentage'). */
  unit: string;
  /** When crossed, signal becomes a Decision (queued for next ritual). */
  decisionThreshold: SignalThreshold;
  /** When crossed, signal becomes an Exception (Ava interrupts immediately). */
  exceptionThreshold: SignalThreshold;
  /** Description of what Ava does automatically when this signal fires. */
  autoAction: string;
}

// ── Configuration (stored in settings) ───────────────────────────────────────

/** Per-signal threshold overrides. Merged with defaults at runtime. */
export interface SignalThresholdOverride {
  enabled?: boolean;
  cooldownMs?: number;
  decisionThreshold?: Partial<SignalThreshold>;
  exceptionThreshold?: Partial<SignalThreshold>;
}

/**
 * Signal dictionary configuration stored in workflow settings.
 * Overrides are keyed by signal name and merged with defaults.
 */
export interface SignalDictionaryConfig {
  /** Whether the signal dictionary is active. Default: true. */
  enabled: boolean;
  /** Per-signal overrides keyed by signal name. */
  overrides: Record<string, SignalThresholdOverride>;
}

// ── Evaluation ───────────────────────────────────────────────────────────────

/**
 * Context provided when evaluating a signal. Includes identifying information
 * so cooldowns can be keyed per-entity (e.g., per-feature, per-project).
 */
export interface SignalContext {
  /** Project path this signal applies to. */
  projectPath: string;
  /** Optional feature ID for feature-scoped signals. */
  featureId?: string;
  /** Optional PR number for review-scoped signals. */
  prNumber?: number;
  /** Additional context passed to the ActionableItem. */
  [key: string]: unknown;
}

/**
 * Result of evaluating a signal against its thresholds.
 */
export interface SignalEvaluation {
  /** Signal name that was evaluated. */
  signalName: string;
  /** The measured value. */
  currentValue: number;
  /** The category this value resolves to. */
  category: SignalCategory;
  /** Whether a new ActionableItem was created. */
  triggered: boolean;
  /** If not triggered, the reason (below_threshold, cooldown, disabled). */
  skipReason?: 'below_threshold' | 'cooldown' | 'disabled';
  /** Context passed through from the evaluation call. */
  context: SignalContext;
}

// ── Default Signal Definitions ───────────────────────────────────────────────

/**
 * The default signal dictionary. These 9 signals cover the core operating model
 * defined in docs/internal/portfolio-philosophy.md.
 *
 * Thresholds are starting values — operators tune them based on experience.
 * If daily reviews consistently have > 10 items, thresholds are too sensitive.
 * If exceptions are missed, thresholds are too loose.
 */
export const DEFAULT_SIGNAL_DEFINITIONS: SignalDefinition[] = [
  {
    name: 'stale-review',
    description: 'PR has been in review status beyond the expected turnaround time.',
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
    unit: 'minutes',
    decisionThreshold: { value: 2880, description: 'PR in review > 48 hours' },
    exceptionThreshold: { value: 5760, description: 'PR in review > 96 hours' },
    autoAction: 'Enable auto-merge at 30 minutes. Ping reviewer at 48 hours. Escalate at 96 hours.',
  },
  {
    name: 'stuck-agent',
    description: 'Agent has made no progress on a feature beyond the expected execution window.',
    enabled: true,
    cooldownMs: 30 * 60 * 1000, // 30 minutes
    unit: 'minutes',
    decisionThreshold: { value: 60, description: 'No progress > 60 minutes' },
    exceptionThreshold: { value: 120, description: 'Stuck + 2 retries failed' },
    autoAction: 'Kill and re-queue at 60 minutes. Escalate after 2 failures.',
  },
  {
    name: 'remediation-loop',
    description: 'Feature has gone through multiple PR review/fix cycles without converging.',
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
    unit: 'count',
    decisionThreshold: { value: 3, description: '> 3 review cycles' },
    exceptionThreshold: { value: 5, description: '> 5 review cycles' },
    autoAction: 'Pause at 3, queue Decision. Kill at 5, queue Exception.',
  },
  {
    name: 'wip-overload',
    description: 'Work-in-progress count has reached or exceeded the configured limit.',
    enabled: true,
    cooldownMs: 15 * 60 * 1000, // 15 minutes
    unit: 'ratio',
    decisionThreshold: { value: 1.0, description: 'WIP at limit' },
    exceptionThreshold: { value: 2.0, description: 'WIP > 2x limit' },
    autoAction: 'Block intake at limit. Exception at 2x.',
  },
  {
    name: 'error-budget',
    description: 'Change failure rate has consumed a significant portion of the error budget.',
    enabled: true,
    cooldownMs: 60 * 60 * 1000, // 1 hour
    unit: 'percentage',
    decisionThreshold: { value: 50, description: '> 50% burn in window' },
    exceptionThreshold: { value: 80, description: '> 80% burn in window' },
    autoAction: 'Queue Decision at 50%. Freeze non-bug releases at 80%.',
  },
  {
    name: 'cost-cap',
    description: 'Feature execution cost is approaching or has exceeded the configured cap.',
    enabled: true,
    cooldownMs: 15 * 60 * 1000, // 15 minutes
    unit: 'percentage',
    decisionThreshold: { value: 80, description: 'Feature at 80% of cost cap' },
    exceptionThreshold: { value: 100, description: 'Feature at 100% of cost cap' },
    autoAction: 'Queue Decision at 80%. Kill agent at 100%.',
  },
  {
    name: 'project-drift',
    description: 'Project milestones are falling behind the expected schedule.',
    enabled: true,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    unit: 'days',
    decisionThreshold: { value: 7, description: 'Milestone > 1 week late' },
    exceptionThreshold: { value: 14, description: '2+ milestones late' },
    autoAction: 'Flag project at-risk at 1 week. Exception at 2 weeks.',
  },
  {
    name: 'ci-saturation',
    description: 'CI pipeline has more pending jobs than the configured maximum.',
    enabled: true,
    cooldownMs: 15 * 60 * 1000, // 15 minutes
    unit: 'ratio',
    decisionThreshold: { value: 1.0, description: 'Pending jobs at limit' },
    exceptionThreshold: { value: 2.0, description: 'Pending jobs > 2x limit' },
    autoAction: 'Pause feature pickup at limit. Exception at 2x.',
  },
  {
    name: 'agent-failure-storm',
    description: 'A single feature has failed repeatedly, indicating a systemic issue.',
    enabled: true,
    cooldownMs: 30 * 60 * 1000, // 30 minutes
    unit: 'count',
    decisionThreshold: { value: 3, description: '3+ failures same feature' },
    exceptionThreshold: { value: 5, description: '5+ failures same feature' },
    autoAction: 'Block at 3 (existing). Exception at 5.',
  },
];
