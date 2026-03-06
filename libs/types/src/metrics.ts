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
