/**
 * Deployment tracking types for real CI/CD pipeline event capture.
 *
 * Deployments are server-wide (the whole app deploys, not individual projects).
 * Stored globally in DATA_DIR/metrics/deployments.json.
 */

/** Target environment for a deployment */
export type DeployEnvironment = 'staging' | 'production';

/** Lifecycle status of a single deployment */
export type DeploymentStatus = 'started' | 'succeeded' | 'failed' | 'rolled_back';

/** A single deployment event recorded by CI workflows */
export interface DeploymentEvent {
  /** Unique deployment ID (nanoid) */
  id: string;
  /** Target environment */
  environment: DeployEnvironment;
  /** Current status */
  status: DeploymentStatus;
  /** Full commit SHA */
  commitSha: string;
  /** Short commit SHA (8 chars) */
  commitShort: string;
  /** Semantic version (e.g. "0.52.0") — set on completion */
  version?: string;
  /** GitHub Actions run ID */
  runId?: string;
  /** GitHub Actions run URL */
  runUrl?: string;
  /** ISO timestamp when deployment started */
  startedAt: string;
  /** ISO timestamp when deployment completed (succeeded/failed/rolled_back) */
  completedAt?: string;
  /** Duration in milliseconds (completedAt - startedAt) */
  durationMs?: number;
  /** Whether the deployment was rolled back */
  rolledBack?: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether agents were drained before deploy */
  agentsDrained?: boolean;
}

/** Persisted deployment document */
export interface DeploymentDocument {
  version: 1;
  updatedAt: string;
  deployments: DeploymentEvent[];
}

/** Aggregated deployment statistics */
export interface DeploymentStats {
  /** Total deployments in window */
  total: number;
  /** Number of successful deployments */
  succeeded: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Deployments per day */
  frequencyPerDay: number;
  /** Number of failed deployments */
  failed: number;
  /** Number of rolled-back deployments */
  rolledBack: number;
}
