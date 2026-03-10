/**
 * Metrics Ledger Types
 *
 * Persistent append-only JSONL ledger for feature completion metrics.
 * Records survive feature archival, enabling historical analytics.
 */

/**
 * A single ledger record capturing a feature completion snapshot.
 * Written to `.automaker/ledger/metrics.jsonl` when a feature reaches done/verified.
 */
export interface MetricsLedgerRecord {
  // Identity
  recordId: string;
  recordType: 'feature_completion';
  timestamp: string; // ISO 8601 write time

  /** Distinguishes the terminal state that triggered this record */
  entryType: 'completed' | 'escalated' | 'abandoned';

  // Feature identity
  featureId: string;
  featureTitle: string;
  category?: string;

  // Grouping
  epicId?: string;
  projectSlug?: string;
  milestoneSlug?: string;
  isEpic: boolean;

  // Lifecycle timestamps
  createdAt: string;
  startedAt?: string;
  reviewStartedAt?: string;
  completedAt: string;

  // Computed timing (ms)
  cycleTimeMs: number;
  agentTimeMs: number;
  prReviewTimeMs?: number;

  // Cost
  totalCostUsd: number;
  costByModel: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;

  // Quality
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  executionCount: number;
  failureCount: number;
  escalated: boolean;
  finalStatus: string;

  // Failure context — populated for 'escalated' and 'abandoned' entries
  /** Reason the feature was escalated (from the escalation signal or feature record) */
  escalationReason?: string;
  /** Most recent status change reason at the time of recording */
  statusChangeReason?: string;
  /** Last Langfuse trace ID from the most recent agent execution */
  lastTraceId?: string;

  // Executions (denormalized history)
  executions: LedgerExecution[];

  // PR tracking
  prNumber?: number;
  prUrl?: string;
  prCreatedAt?: string;
  prMergedAt?: string;

  // Git tracking
  commitCount?: number;
  branchName?: string;

  // Agent
  assignedModel?: string;
}

export interface LedgerExecution {
  model: string;
  costUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  trigger: 'auto' | 'manual' | 'retry';
}

/**
 * Filter options for querying ledger records
 */
export interface LedgerQueryOptions {
  startDate?: string;
  endDate?: string;
  projectSlug?: string;
  epicId?: string;
  complexity?: string;
  minCostUsd?: number;
  maxCostUsd?: number;
}

/**
 * A single data point in a time series
 */
export interface TimeSeriesPoint {
  date: string; // ISO date (day bucket)
  value: number;
  label?: string;
}

/**
 * Time series dataset with metadata
 */
export interface TimeSeriesData {
  metric: string;
  groupBy: 'day' | 'week' | 'month';
  points: TimeSeriesPoint[];
  total: number;
}

/**
 * Aggregate metrics computed from ledger records
 */
export interface LedgerAggregateMetrics {
  totalFeatures: number;
  totalCostUsd: number;
  avgCostPerFeature: number;
  avgCycleTimeMs: number;
  avgAgentTimeMs: number;
  avgPrReviewTimeMs: number;
  successRate: number;
  escalationRate: number;
  throughputPerDay: number;
  costByModel: Record<string, number>;
  modelDistribution: Record<string, number>;
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
  };
  // PR throughput
  totalPRsMerged: number;
  prsPerDay: number;
  prsPerHour: number;
  // Commit throughput
  totalCommits: number;
  commitsPerDay: number;
  commitsPerHour: number;
  // Period
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Cycle time distribution bucket
 */
export interface CycleTimeBucket {
  label: string;
  minMs: number;
  maxMs: number;
  count: number;
}

/**
 * Available time series metrics
 */
export type TimeSeriesMetric =
  | 'cost'
  | 'throughput'
  | 'success_rate'
  | 'cycle_time'
  | 'pr_throughput'
  | 'commit_throughput';

/**
 * Time range grouping options
 */
export type TimeGroupBy = 'day' | 'week' | 'month';

// ---------------------------------------------------------------------------
// DORA Metrics Time-Series Persistence
// ---------------------------------------------------------------------------

/**
 * A single DORA metrics snapshot — one entry per collection event.
 * Persisted to `.automaker/metrics/dora.json` as an array of entries.
 */
export interface DoraTimeSeriesEntry {
  /** ISO 8601 timestamp when this entry was recorded */
  timestamp: string;

  /**
   * Deployment Frequency: count of PRs merged to dev per day.
   * Derived from feature:pr-merged events.
   */
  deploymentFrequency: {
    /** Total merges recorded in the current day bucket */
    mergesPerDay: number;
    /** Total merges recorded in the current week bucket */
    mergesPerWeek: number;
    /** Date bucket (YYYY-MM-DD) */
    dayBucket: string;
  };

  /**
   * Change Lead Time: time from feature creation to PR merge (in ms).
   * Derived from feature:pr-merged events by looking up feature.createdAt.
   */
  changeLeadTime: {
    /** Feature ID */
    featureId: string;
    /** Title of the feature */
    featureTitle?: string;
    /** ISO timestamp when the feature was created */
    featureCreatedAt: string;
    /** ISO timestamp when the PR was merged */
    prMergedAt: string;
    /** Lead time in milliseconds */
    leadTimeMs: number;
  } | null;

  /**
   * Change Fail Rate: snapshot of failure ratio at collection time.
   * Derived from pr:ci-failure, feature:error, and feature:pr-merged events.
   */
  changeFailRate: {
    /** Total merges seen (cumulative) */
    totalMerges: number;
    /** Total failures seen (CI failures + post-merge remediations) (cumulative) */
    totalFailures: number;
    /** Current ratio (totalFailures / totalMerges), or 0 if no merges */
    ratio: number;
  };

  /**
   * Recovery Time: time from failure detection to fix merge (in ms).
   * Derived from pr:ci-failure -> feature:pr-merged events for the same feature.
   */
  recoveryTime: {
    /** Feature ID of the recovered feature */
    featureId: string;
    /** ISO timestamp when failure was detected */
    failureDetectedAt: string;
    /** ISO timestamp when the fix was merged */
    fixMergedAt: string;
    /** Recovery time in milliseconds */
    recoveryTimeMs: number;
  } | null;
}

/**
 * The full DORA time-series document persisted to disk.
 */
export interface DoraTimeSeriesDocument {
  /** Schema version for forward compatibility */
  version: 1;
  /** ISO timestamp of last write */
  updatedAt: string;
  /** Ordered list of snapshot entries (newest last) */
  entries: DoraTimeSeriesEntry[];
}

// ---------------------------------------------------------------------------
// Agentic Metrics Persistence
// ---------------------------------------------------------------------------

/**
 * Autonomy rate snapshot — percentage of features that reached "done" without
 * human intervention beyond approval gates.
 */
export interface AgenticAutonomyRate {
  totalDone: number;
  autonomousDone: number;
  rate: number;
}

/**
 * Remediation loop counts per feature — number of PR iterations before merge.
 */
export interface AgenticRemediationRecord {
  featureId: string;
  reviewIterations: number;
  merged: boolean;
}

/**
 * WIP saturation for a single pipeline stage.
 */
export interface AgenticWipSaturation {
  stage: 'execution' | 'review' | 'approval';
  currentWip: number;
  wipLimit: number | null;
  saturation: number | null;
}

/**
 * A single agentic-metrics snapshot — one entry per collection event.
 * Persisted to `.automaker/metrics/agentic.json` as an array of entries.
 */
export interface AgenticMetricsEntry {
  timestamp: string;
  autonomyRate: AgenticAutonomyRate;
  remediationLoops: AgenticRemediationRecord[];
  /** TODO: integrate Langfuse cost API — currently null until available */
  costPerFeatureUsd: number | null;
  wipSaturation: AgenticWipSaturation[];
}

/**
 * The full agentic metrics document persisted to disk.
 */
export interface AgenticMetricsDocument {
  version: 1;
  updatedAt: string;
  entries: AgenticMetricsEntry[];
}
