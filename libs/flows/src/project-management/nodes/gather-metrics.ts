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
import { createLogger } from '@automaker/utils';

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

const logger = createLogger('GatherMetricsNode');

/**
 * Creates a gather metrics node with injected collector
 */
export function createGatherMetricsNode(
  collector: MetricsCollector
): (state: ProjectStatusState) => Promise<Partial<ProjectStatusState>> {
  return async (state: ProjectStatusState): Promise<Partial<ProjectStatusState>> => {
    const nodeName = 'gather_metrics';
    const startTime = new Date();
    let spanId: string | undefined;

    try {
      // Create trace span if Langfuse is available
      if (state.langfuseClient?.isAvailable() && state.traceId) {
        spanId = `${nodeName}-${Date.now()}`;
        state.langfuseClient.createSpan({
          traceId: state.traceId,
          id: spanId,
          name: nodeName,
          input: { projectPath: state.projectPath },
          metadata: { nodeType: 'metrics' },
          startTime,
        });
      }

      const [boardMetrics, prMetrics, dependencyMetrics, agentMetrics] = await Promise.all([
        collector.getBoardMetrics(state.projectPath),
        collector.getPRMetrics(state.projectPath),
        collector.getDependencyMetrics(state.projectPath),
        collector.getAgentMetrics(state.projectPath),
      ]);

      const endTime = new Date();

      // Update span with output
      if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
        state.langfuseClient.createSpan({
          traceId: state.traceId,
          id: spanId,
          name: nodeName,
          input: { projectPath: state.projectPath },
          output: {
            totalFeatures: boardMetrics.totalFeatures,
            openPRs: prMetrics.openPRs,
            dependencies: dependencyMetrics.totalDependencies,
            agents: agentMetrics.runningAgents,
          },
          metadata: {
            nodeType: 'metrics',
            success: true,
            features: boardMetrics.totalFeatures,
            prs: prMetrics.openPRs,
          },
          startTime,
          endTime,
        });
        await state.langfuseClient.flush();
      }

      return { boardMetrics, prMetrics, dependencyMetrics, agentMetrics };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[${nodeName}] Failed:`, err);

      // Update span with error
      if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
        state.langfuseClient.createSpan({
          traceId: state.traceId,
          id: spanId,
          name: nodeName,
          input: { projectPath: state.projectPath },
          output: '',
          metadata: { nodeType: 'metrics', success: false, error: errorMsg },
          startTime,
          endTime: new Date(),
        });
        await state.langfuseClient.flush();
      }

      return {
        error: `Failed to gather metrics: ${errorMsg}`,
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
  const nodeName = 'gather_metrics';
  const startTime = new Date();
  let spanId: string | undefined;

  try {
    // Create trace span if Langfuse is available
    if (state.langfuseClient?.isAvailable() && state.traceId) {
      spanId = `${nodeName}-${Date.now()}`;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { projectPath: state.projectPath },
        metadata: { nodeType: 'metrics' },
        startTime,
      });
    }

    const result = await createGatherMetricsNode(_collector)(state);

    const endTime = new Date();

    // Update span with output
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      const boardMetrics = result.boardMetrics;
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { projectPath: state.projectPath },
        output: boardMetrics ? { totalFeatures: boardMetrics.totalFeatures } : {},
        metadata: {
          nodeType: 'metrics',
          success: !result.error,
        },
        startTime,
        endTime,
      });
      await state.langfuseClient.flush();
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${nodeName}] Failed:`, err);

    // Update span with error
    if (state.langfuseClient?.isAvailable() && state.traceId && spanId) {
      state.langfuseClient.createSpan({
        traceId: state.traceId,
        id: spanId,
        name: nodeName,
        input: { projectPath: state.projectPath },
        output: '',
        metadata: { nodeType: 'metrics', success: false, error: errorMsg },
        startTime,
        endTime: new Date(),
      });
      await state.langfuseClient.flush();
    }

    throw err;
  }
}
