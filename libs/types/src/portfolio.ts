/**
 * Portfolio-level metrics types — aggregated cost, throughput, and flow efficiency
 * across all registered projects. Computed by MetricsService.getPortfolioMetrics()
 * and consumed by WSJF scoring in protoWorkstacean.
 */

export interface PortfolioMetrics {
  generatedAt: string;
  windowDays: number;
  totalCostUsd: number;
  totalFeaturesCompleted: number;
  portfolioThroughputPerDay: number;
  avgCycleTimeMs: number;
  portfolioFlowEfficiency: number;
  errorBudgetsByProject: Record<
    string,
    { remaining: number; status: 'healthy' | 'warning' | 'exhausted' }
  >;
  highestCostProject: string;
  lowestThroughputProject: string;
}
