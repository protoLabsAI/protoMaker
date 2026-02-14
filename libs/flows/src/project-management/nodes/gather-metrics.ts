/**
 * Gather Metrics Node
 *
 * Collects board, PR, dependency, and agent metrics from the project.
 * Currently uses deterministic mock data — will be wired to real services
 * when integrated into the server runtime.
 *
 * In production, this node receives injected service references via config
 * to call FeatureLoader, PRFeedbackService, etc.
 */

import type {
  ProjectStatusState,
  BoardMetrics,
  PRMetrics,
  DependencyMetrics,
  AgentMetrics,
} from '../types.js';

/**
 * Service interface for metrics collection
 * Allows dependency injection of real services in server context
 */
export interface MetricsCollector {
  getBoardMetrics(projectPath: string): Promise<BoardMetrics>;
  getPRMetrics(projectPath: string): Promise<PRMetrics>;
  getDependencyMetrics(projectPath: string): Promise<DependencyMetrics>;
  getAgentMetrics(projectPath: string): Promise<AgentMetrics>;
}

/**
 * Mock metrics collector for testing and development
 */
export const mockMetricsCollector: MetricsCollector = {
  async getBoardMetrics(): Promise<BoardMetrics> {
    return {
      totalFeatures: 16,
      byStatus: {
        backlog: 8,
        in_progress: 3,
        review: 4,
        done: 1,
      },
      completionPercentage: 31,
      blockedFeatures: [],
      staleFeatures: [],
      recentlyCompleted: [
        {
          id: 'feature-001',
          title: 'Outbound dependency sync',
          completedAt: new Date().toISOString(),
          costUsd: 1.4,
        },
      ],
    };
  },

  async getPRMetrics(): Promise<PRMetrics> {
    return {
      openPRs: 5,
      mergedToday: 2,
      conflicting: 0,
      pendingReview: 3,
      avgMergeTimeHours: 0.5,
      prDetails: [],
    };
  },

  async getDependencyMetrics(): Promise<DependencyMetrics> {
    return {
      totalDependencies: 8,
      satisfiedDependencies: 5,
      blockingChains: [],
      criticalPath: ['foundation-types', 'sync-service', 'bridge-service'],
    };
  },

  async getAgentMetrics(): Promise<AgentMetrics> {
    return {
      runningAgents: 3,
      totalCostUsd: 5.94,
      avgExecutionTimeMs: 234000,
      failureRate: 0,
      agentDetails: [],
    };
  },
};

// Module-level collector reference — set via createGatherMetricsNode()
let _collector: MetricsCollector = mockMetricsCollector;

/**
 * Creates a gather metrics node with injected collector
 */
export function createGatherMetricsNode(
  collector: MetricsCollector
): (state: ProjectStatusState) => Promise<Partial<ProjectStatusState>> {
  return async (state: ProjectStatusState): Promise<Partial<ProjectStatusState>> => {
    try {
      const [boardMetrics, prMetrics, dependencyMetrics, agentMetrics] = await Promise.all([
        collector.getBoardMetrics(state.projectPath),
        collector.getPRMetrics(state.projectPath),
        collector.getDependencyMetrics(state.projectPath),
        collector.getAgentMetrics(state.projectPath),
      ]);

      return { boardMetrics, prMetrics, dependencyMetrics, agentMetrics };
    } catch (err) {
      return {
        error: `Failed to gather metrics: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}

/**
 * Default gather metrics node using mock collector
 */
export async function gatherMetrics(
  state: ProjectStatusState
): Promise<Partial<ProjectStatusState>> {
  return createGatherMetricsNode(_collector)(state);
}
