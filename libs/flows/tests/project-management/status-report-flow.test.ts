import { describe, it, expect, vi } from 'vitest';
import {
  createStatusReportFlow,
  executeStatusReport,
  type MetricsCollector,
  type BoardMetrics,
  type PRMetrics,
  type DependencyMetrics,
  type AgentMetrics,
} from '../../src/project-management/index.js';

function createMockCollector(overrides?: Partial<MetricsCollector>): MetricsCollector {
  return {
    async getBoardMetrics(): Promise<BoardMetrics> {
      return {
        totalFeatures: 16,
        byStatus: { backlog: 8, in_progress: 3, review: 4, done: 1 },
        completionPercentage: 31,
        blockedFeatures: [],
        staleFeatures: [],
        recentlyCompleted: [
          {
            id: 'f1',
            title: 'Feature A',
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
        prDetails: [],
      };
    },
    async getDependencyMetrics(): Promise<DependencyMetrics> {
      return {
        totalDependencies: 8,
        satisfiedDependencies: 5,
        blockingChains: [],
        criticalPath: ['types', 'sync', 'bridge'],
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
    ...overrides,
  };
}

describe('Status Report Flow', () => {
  it('should create a flow and execute with mock data', async () => {
    const collector = createMockCollector();
    const flow = createStatusReportFlow({ metricsCollector: collector });

    const result = await flow.invoke({
      projectPath: '/test/project',
    });

    expect(result.formattedReport).toBeDefined();
    expect(result.formattedReport).toContain('Project Status Report');
    expect(result.error).toBeUndefined();
  });

  it('should include board metrics in the report', async () => {
    const collector = createMockCollector();
    const result = await executeStatusReport('/test/project', {
      metricsCollector: collector,
    });

    expect(result).toContain('Board Status');
    expect(result).toContain('backlog');
    expect(result).toContain('16');
  });

  it('should include PR metrics when present', async () => {
    const collector = createMockCollector();
    const result = await executeStatusReport('/test/project', {
      metricsCollector: collector,
    });

    expect(result).toContain('Pull Requests');
    expect(result).toContain('Merged today: 2');
  });

  it('should identify risks when metrics indicate problems', async () => {
    const collector = createMockCollector({
      async getBoardMetrics(): Promise<BoardMetrics> {
        return {
          totalFeatures: 20,
          byStatus: { backlog: 10, in_progress: 5, review: 2, done: 3 },
          completionPercentage: 15,
          blockedFeatures: ['f1', 'f2', 'f3'],
          staleFeatures: ['f4', 'f5'],
          recentlyCompleted: [],
        };
      },
      async getPRMetrics(): Promise<PRMetrics> {
        return {
          openPRs: 8,
          mergedToday: 0,
          conflicting: 3,
          pendingReview: 6,
          prDetails: [],
        };
      },
    });

    const flow = createStatusReportFlow({ metricsCollector: collector });
    const result = await flow.invoke({ projectPath: '/test/project' });

    expect(result.statusReport?.health).toBe('behind');
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.formattedReport).toContain('Risks');
  });

  it('should detect on-track health when metrics are good', async () => {
    const collector = createMockCollector({
      async getBoardMetrics(): Promise<BoardMetrics> {
        return {
          totalFeatures: 10,
          byStatus: { backlog: 1, in_progress: 2, review: 1, done: 6 },
          completionPercentage: 70,
          blockedFeatures: [],
          staleFeatures: [],
          recentlyCompleted: [
            {
              id: 'f1',
              title: 'Done Feature',
              completedAt: new Date().toISOString(),
            },
          ],
        };
      },
    });

    const flow = createStatusReportFlow({ metricsCollector: collector });
    const result = await flow.invoke({ projectPath: '/test/project' });

    expect(result.statusReport?.health).toBe('on-track');
    expect(result.formattedReport).toContain('on-track');
  });

  it('should include project slug when provided', async () => {
    const result = await executeStatusReport('/test/project', {
      projectSlug: 'linear-deep-integration',
      metricsCollector: createMockCollector(),
    });

    expect(result).toContain('linear-deep-integration');
  });

  it('should include recommendations', async () => {
    const result = await executeStatusReport('/test/project', {
      metricsCollector: createMockCollector(),
    });

    expect(result).toContain('Recommendations');
  });

  it('should handle collector errors gracefully', async () => {
    const collector = createMockCollector({
      async getBoardMetrics(): Promise<BoardMetrics> {
        throw new Error('Connection refused');
      },
    });

    const flow = createStatusReportFlow({ metricsCollector: collector });
    const result = await flow.invoke({ projectPath: '/test/project' });

    expect(result.error).toContain('Connection refused');
  });

  it('should create flow without config (uses mock collector)', async () => {
    const flow = createStatusReportFlow();
    const result = await flow.invoke({ projectPath: '/test/project' });

    expect(result.formattedReport).toBeDefined();
    expect(result.error).toBeUndefined();
  });
});
