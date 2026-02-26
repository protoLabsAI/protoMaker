/**
 * System, metrics, integrations, lifecycle, pipeline, and MCP client mixin.
 *
 * Extracted from the monolithic http-api-client.ts — contains:
 *   - mcp           (test server, list tools)
 *   - pipeline      (workflow pipeline step config)
 *   - metrics       (summary, capacity, forecast, ledger analytics)
 *   - integrations  (status)
 *   - system        (health dashboard)
 *   - analytics     (agent performance)
 *   - lifecycle     (project CRUD, PRD approval)
 *
 * The engine property lives in engine-client.ts (withEngineClient).
 */
import type {
  LedgerAggregateResponse,
  TimeSeriesResponse,
  ModelDistributionResponse,
  CycleTimeDistributionResponse,
  CapacityMetricsResponse,
  IntegrationStatusResponse,
  SystemHealthResponse,
} from './api-types';
import { BaseHttpClient, type Constructor } from './base-http-client';

export const withSystemClient = <TBase extends Constructor<BaseHttpClient>>(Base: TBase) =>
  class extends Base {
    // MCP API - Test MCP server connections and list tools
    // SECURITY: Only accepts serverId, not arbitrary serverConfig, to prevent
    // drive-by command execution attacks. Servers must be saved first.
    mcp = {
      testServer: (
        serverId: string
      ): Promise<{
        success: boolean;
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
          enabled: boolean;
        }>;
        error?: string;
        connectionTime?: number;
        serverInfo?: {
          name?: string;
          version?: string;
        };
      }> => this.post('/api/mcp/test', { serverId }),

      listTools: (
        serverId: string
      ): Promise<{
        success: boolean;
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
          enabled: boolean;
        }>;
        error?: string;
      }> => this.post('/api/mcp/tools', { serverId }),
    };

    // Pipeline API - custom workflow pipeline steps
    pipeline = {
      getConfig: (
        projectPath: string
      ): Promise<{
        success: boolean;
        config?: {
          version: 1;
          steps: Array<{
            id: string;
            name: string;
            order: number;
            instructions: string;
            colorClass: string;
            createdAt: string;
            updatedAt: string;
          }>;
        };
        error?: string;
      }> => this.post('/api/pipeline/config', { projectPath }),

      saveConfig: (
        projectPath: string,
        config: {
          version: 1;
          steps: Array<{
            id: string;
            name: string;
            order: number;
            instructions: string;
            colorClass: string;
            createdAt: string;
            updatedAt: string;
          }>;
        }
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/pipeline/config/save', { projectPath, config }),

      addStep: (
        projectPath: string,
        step: {
          name: string;
          order: number;
          instructions: string;
          colorClass: string;
        }
      ): Promise<{
        success: boolean;
        step?: {
          id: string;
          name: string;
          order: number;
          instructions: string;
          colorClass: string;
          createdAt: string;
          updatedAt: string;
        };
        error?: string;
      }> => this.post('/api/pipeline/steps/add', { projectPath, step }),

      updateStep: (
        projectPath: string,
        stepId: string,
        updates: Partial<{
          name: string;
          order: number;
          instructions: string;
          colorClass: string;
        }>
      ): Promise<{
        success: boolean;
        step?: {
          id: string;
          name: string;
          order: number;
          instructions: string;
          colorClass: string;
          createdAt: string;
          updatedAt: string;
        };
        error?: string;
      }> => this.post('/api/pipeline/steps/update', { projectPath, stepId, updates }),

      deleteStep: (
        projectPath: string,
        stepId: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/pipeline/steps/delete', { projectPath, stepId }),

      reorderSteps: (
        projectPath: string,
        stepIds: string[]
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/pipeline/steps/reorder', { projectPath, stepIds }),
    };

    // Metrics API
    metrics = {
      summary: (projectPath: string) => this.post('/api/metrics/summary', { projectPath }),
      capacity: (projectPath: string, maxConcurrency?: number) =>
        this.post<CapacityMetricsResponse>('/api/metrics/capacity', {
          projectPath,
          maxConcurrency,
        }),
      forecast: (projectPath: string, complexity?: string) =>
        this.post('/api/metrics/forecast', { projectPath, complexity }),
      // Ledger API (persistent time-series analytics)
      ledgerAggregate: (
        projectPath: string,
        opts?: { startDate?: string; endDate?: string; projectSlug?: string; epicId?: string }
      ): Promise<LedgerAggregateResponse> =>
        this.post('/api/metrics/ledger/aggregate', { projectPath, ...opts }),
      timeSeries: (
        projectPath: string,
        metric: string,
        groupBy: string,
        opts?: { startDate?: string; endDate?: string }
      ): Promise<TimeSeriesResponse> =>
        this.post('/api/metrics/ledger/time-series', { projectPath, metric, groupBy, ...opts }),
      modelDistribution: (
        projectPath: string,
        opts?: { startDate?: string; endDate?: string }
      ): Promise<ModelDistributionResponse> =>
        this.post('/api/metrics/ledger/model-distribution', { projectPath, ...opts }),
      cycleTimeDistribution: (
        projectPath: string,
        opts?: { startDate?: string; endDate?: string }
      ): Promise<CycleTimeDistributionResponse> =>
        this.post('/api/metrics/ledger/cycle-time-distribution', { projectPath, ...opts }),
      backfill: (projectPath: string) => this.post('/api/metrics/ledger/backfill', { projectPath }),
    };

    // Integrations API
    integrations = {
      status: (projectPath: string) =>
        this.post<IntegrationStatusResponse>('/api/integrations/status', { projectPath }),
    };

    // System API
    system = {
      healthDashboard: (projectPath?: string) =>
        this.post<SystemHealthResponse>('/api/system/health-dashboard', { projectPath }),
    };

    // Analytics API
    analytics = {
      getAgentPerformance: (projectPath: string) =>
        this.post('/api/analytics/agent-performance', { projectPath }),
    };

    // Project Lifecycle API
    lifecycle = {
      getProject: (
        projectPath: string,
        projectSlug: string
      ): Promise<{
        success: boolean;
        project?: {
          slug: string;
          title: string;
          status: string;
          prd?: { situation: string; problem: string; approach: string; results: string };
          milestones?: Array<{ title: string; phases: Array<{ title: string; status?: string }> }>;
        };
        error?: string;
      }> => this.post('/api/projects/get', { projectPath, projectSlug }),
      approvePrd: (
        projectPath: string,
        projectSlug: string,
        options?: { createEpics?: boolean; setupDependencies?: boolean }
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/projects/lifecycle/approve-prd', {
          projectPath,
          projectSlug,
          ...options,
        }),
      getStatus: (
        projectPath: string,
        projectSlug: string
      ): Promise<{
        success: boolean;
        status?: string;
        error?: string;
      }> => this.post('/api/projects/lifecycle/status', { projectPath, projectSlug }),
      requestChanges: (
        projectPath: string,
        projectSlug: string,
        feedback: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/projects/lifecycle/request-changes', {
          projectPath,
          projectSlug,
          feedback,
        }),
      listProjects: (
        projectPath: string
      ): Promise<{ success: boolean; projects?: string[]; error?: string }> =>
        this.post('/api/projects/list', { projectPath }),
      deleteProject: (
        projectPath: string,
        projectSlug: string
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/projects/delete', { projectPath, projectSlug }),
      updateProject: (
        projectPath: string,
        projectSlug: string,
        updates: Record<string, unknown>
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/projects/update', { projectPath, projectSlug, updates }),
    };
  };
