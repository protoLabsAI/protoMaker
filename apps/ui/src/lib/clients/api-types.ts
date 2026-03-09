/**
 * API response types used by UI components.
 *
 * Extracted from the monolithic http-api-client.ts so that domain-specific
 * client mixins and consuming components can import only the types they need.
 */

// Ledger API response types

export interface LedgerAggregateResponse {
  success: boolean;
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
  tokenUsage: { totalInputTokens: number; totalOutputTokens: number; totalTokens: number };
  totalPRsMerged: number;
  prsPerDay: number;
  prsPerHour: number;
  totalCommits: number;
  commitsPerDay: number;
  commitsPerHour: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface TimeSeriesResponse {
  success: boolean;
  metric: string;
  groupBy: string;
  points: Array<{ date: string; value: number }>;
  total: number;
}

export interface ModelDistributionResponse {
  success: boolean;
  distribution: Record<string, number>;
}

export interface CycleTimeDistributionResponse {
  success: boolean;
  buckets: Array<{ label: string; minMs: number; maxMs: number; count: number }>;
}

/**
 * Response from POST /api/system/health-dashboard
 * Mirrors the JSON shape returned by apps/server/src/routes/dashboard.ts
 */
export interface SystemHealthResponse {
  success: boolean;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    systemUsed: number;
    systemTotal: number;
    usedPercent: number;
  };
  cpu: {
    loadAvg1m: number;
    cores: number;
    loadPercent: number;
  };
  heap: {
    used: number;
    total: number;
    percentage: number;
  };
  agents: {
    count: number;
    active: string[];
  };
  autoMode: {
    isRunning: boolean;
    runningCount: number;
    runningFeatures: string[];
  };
  leadEngineer: {
    running: boolean;
    sessionCount: number;
    sessions: Array<{
      projectPath: string;
      projectSlug: string;
      flowState: string;
      startedAt: string;
    }>;
  };
  uptime: number;
  timestamp: string;
  /** Optional crew loop status (populated when crew loop is running) */
  crew?: {
    members: Record<
      string,
      {
        id: string;
        displayName?: string;
        running?: boolean;
        enabled?: boolean;
        lastCheck?: string;
      }
    >;
  };
}

/**
 * Response from POST /api/integrations/status
 * Mirrors the JSON shape returned by apps/server/src/routes/integrations/index.ts
 */
export interface IntegrationStatusResponse {
  success: boolean;
  discord: {
    connected: boolean;
    botOnline: boolean;
  };
  github: {
    authenticated: boolean;
  };
}

/**
 * Response from POST /api/metrics/capacity
 * Mirrors the CapacityMetrics interface in apps/server/src/services/metrics-service.ts
 */
export interface CapacityMetricsResponse {
  currentConcurrency: number;
  maxConcurrency: number;
  backlogSize: number;
  blockedCount: number;
  reviewCount: number;
  avgCompletionTimeMs: number;
  estimatedBacklogTimeMs: number;
  utilizationPercent: number;
}

/**
 * Response from GET /api/metrics/friction
 */
export interface FrictionResponse {
  success: boolean;
  patterns: Array<{ pattern: string; count: number; lastSeen: string }>;
  total: number;
}

/**
 * Response from GET /api/metrics/failure-breakdown
 */
export interface FailureBreakdownResponse {
  success: boolean;
  categories: Array<{ category: string; count: number }>;
  total: number;
}

/**
 * Dev server log event payloads for WebSocket streaming
 */
export interface DevServerStartedEvent {
  worktreePath: string;
  port: number;
  url: string;
  timestamp: string;
}

export interface DevServerOutputEvent {
  worktreePath: string;
  content: string;
  timestamp: string;
}

export interface DevServerStoppedEvent {
  worktreePath: string;
  port: number;
  exitCode: number | null;
  error?: string;
  timestamp: string;
}

export type DevServerLogEvent =
  | { type: 'dev-server:started'; payload: DevServerStartedEvent }
  | { type: 'dev-server:output'; payload: DevServerOutputEvent }
  | { type: 'dev-server:stopped'; payload: DevServerStoppedEvent };

/**
 * Response type for fetching dev server logs
 */
export interface DevServerLogsResponse {
  success: boolean;
  result?: {
    worktreePath: string;
    port: number;
    url: string;
    logs: string;
    startedAt: string;
  };
  error?: string;
}
