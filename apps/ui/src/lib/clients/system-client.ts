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
  FrictionResponse,
  FailureBreakdownResponse,
} from './api-types';
import type {
  DiscordChannelSignalConfig,
  DoraMetrics,
  DoraRegulationAlert,
  Project,
  ProjectHealth,
  HivemindPeer,
  SyncServerStatus,
} from '@protolabsai/types';
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

    // DORA Metrics API
    dora = {
      metrics: (projectPath: string, timeWindowDays?: number) =>
        this.get<{ success: boolean; metrics: DoraMetrics; alerts: DoraRegulationAlert[] }>(
          `/api/dora/metrics?projectPath=${encodeURIComponent(projectPath)}${timeWindowDays ? `&timeWindowDays=${timeWindowDays}` : ''}`
        ),
      history: (projectPath: string, window?: '7d' | '30d' | '90d') =>
        this.get<{
          success: boolean;
          buckets: Array<{
            date: string;
            leadTime: number;
            recoveryTime: number;
            deploymentFrequency: number;
            changeFailureRate: number;
          }>;
          window: string;
        }>(
          `/api/dora/history?projectPath=${encodeURIComponent(projectPath)}${window ? `&window=${window}` : ''}`
        ),
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
      stageDurations: (projectPath: string) =>
        this.get<{
          success: boolean;
          features: Array<{
            featureId: string;
            title: string;
            stages: { backlog: number; in_progress: number; review: number; blocked: number };
            totalMs: number;
            flowEfficiency: number;
          }>;
          aggregate: {
            totalMs: number;
            stages: { backlog: number; in_progress: number; review: number; blocked: number };
            percentages: { backlog: number; in_progress: number; review: number; blocked: number };
            flowEfficiency: number;
          };
          featureCount: number;
        }>(`/api/metrics/stage-durations?projectPath=${encodeURIComponent(projectPath)}`),
      flow: (projectPath: string, days?: number, wipLimit?: number) =>
        this.get<{
          success: boolean;
          days: Array<{
            date: string;
            backlog: number;
            in_progress: number;
            review: number;
            done: number;
          }>;
          wipLimit: number;
          statuses: readonly ['backlog', 'in_progress', 'review', 'done'];
        }>(
          `/api/metrics/flow?projectPath=${encodeURIComponent(projectPath)}${days ? `&days=${days}` : ''}${wipLimit != null ? `&wipLimit=${wipLimit}` : ''}`
        ),
      friction: (): Promise<FrictionResponse> => this.get('/api/metrics/friction'),
      failureBreakdown: (projectPath: string): Promise<FailureBreakdownResponse> =>
        this.get(`/api/metrics/failure-breakdown?projectPath=${encodeURIComponent(projectPath)}`),
      blockedTimeline: (projectPath: string) =>
        this.get<{
          success: boolean;
          features: Array<{
            featureId: string;
            title: string;
            blockedPeriods: Array<{
              startDate: string;
              endDate: string;
              durationMs: number;
              reason: string;
              category: 'dependency' | 'review' | 'unclear' | 'other';
            }>;
            totalBlockedMs: number;
          }>;
          featureCount: number;
        }>(`/api/metrics/blocked-timeline?projectPath=${encodeURIComponent(projectPath)}`),
      agenticMetrics: (projectPath: string) =>
        this.get<{
          success: boolean;
          updatedAt: string;
          latest: {
            timestamp: string;
            autonomyRate: { totalDone: number; autonomousDone: number; rate: number };
            remediationLoops: Array<{
              featureId: string;
              reviewIterations: number;
              merged: boolean;
            }>;
            costPerFeatureUsd: number | null;
            wipSaturation: Array<{
              stage: 'execution' | 'review' | 'approval';
              currentWip: number;
              wipLimit: number | null;
              saturation: number | null;
            }>;
          } | null;
          entryCount: number;
        }>(`/api/metrics/agentic?projectPath=${encodeURIComponent(projectPath)}`),
      doraSnapshot: (projectPath: string, timeWindowDays?: number) =>
        this.get<{
          success: boolean;
          metrics: import('@protolabsai/types').DoraMetrics;
        }>(
          `/api/metrics/dora?projectPath=${encodeURIComponent(projectPath)}${timeWindowDays ? `&timeWindowDays=${timeWindowDays}` : ''}`
        ),
      summaryGet: (projectPath: string) =>
        this.get<{ success: boolean } & Record<string, unknown>>(
          `/api/metrics/summary?projectPath=${encodeURIComponent(projectPath)}`
        ),
    };

    // Integrations API
    integrations = {
      status: (projectPath: string) =>
        this.post<IntegrationStatusResponse>('/api/integrations/status', { projectPath }),
      getSignalChannels: (projectPath: string) =>
        this.get<{ channels: DiscordChannelSignalConfig[] }>(
          `/api/integrations/signal-channels?projectPath=${encodeURIComponent(projectPath)}`
        ),
      updateSignalChannels: (projectPath: string, channels: DiscordChannelSignalConfig[]) =>
        this.put<{ channels: DiscordChannelSignalConfig[] }>('/api/integrations/signal-channels', {
          projectPath,
          channels,
        }),
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
        project?: Project;
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
      initiate: (
        projectPath: string,
        title: string,
        ideaDescription: string
      ): Promise<{
        success: boolean;
        duplicates?: Array<{ id: string; name: string; url: string }>;
        localSlug?: string;
        hasDuplicates?: boolean;
        error?: string;
      }> => this.post('/api/projects/lifecycle/initiate', { projectPath, title, ideaDescription }),
      createProject: (
        projectPath: string,
        project: { slug: string; title: string; goal: string }
      ): Promise<{ success: boolean; error?: string }> =>
        this.post('/api/projects/create', { projectPath, ...project }),
      launch: (
        projectPath: string,
        projectSlug: string,
        maxConcurrency?: number
      ): Promise<{
        success: boolean;
        autoModeStarted?: boolean;
        featuresInBacklog?: number;
        error?: string;
      }> =>
        this.post('/api/projects/lifecycle/launch', { projectPath, projectSlug, maxConcurrency }),

      // --- Shared tool routes (mounted via Express adapter) ---

      addLink: (projectPath: string, projectSlug: string, label: string, url: string) =>
        this.post('/api/projects/tools/project_add_link', { projectPath, projectSlug, label, url }),
      removeLink: (projectPath: string, projectSlug: string, linkId: string) =>
        this.post('/api/projects/tools/project_remove_link', { projectPath, projectSlug, linkId }),
      addStatusUpdate: (
        projectPath: string,
        projectSlug: string,
        health: ProjectHealth,
        body: string,
        author: string
      ) =>
        this.post('/api/projects/tools/project_add_update', {
          projectPath,
          projectSlug,
          health,
          body,
          author,
        }),
      removeStatusUpdate: (projectPath: string, projectSlug: string, updateId: string) =>
        this.post('/api/projects/tools/project_remove_update', {
          projectPath,
          projectSlug,
          updateId,
        }),
      listDocs: (projectPath: string, projectSlug: string) =>
        this.post('/api/projects/tools/project_list_docs', { projectPath, projectSlug }),
      getDoc: (projectPath: string, projectSlug: string, docId: string) =>
        this.post('/api/projects/tools/project_get_doc', { projectPath, projectSlug, docId }),
      createDoc: (projectPath: string, projectSlug: string, title: string, content?: string) =>
        this.post('/api/projects/tools/project_create_doc', {
          projectPath,
          projectSlug,
          title,
          content,
        }),
      updateDoc: (
        projectPath: string,
        projectSlug: string,
        docId: string,
        title?: string,
        content?: string
      ) =>
        this.post('/api/projects/tools/project_update_doc', {
          projectPath,
          projectSlug,
          docId,
          title,
          content,
        }),
      deleteDoc: (projectPath: string, projectSlug: string, docId: string) =>
        this.post('/api/projects/tools/project_delete_doc', { projectPath, projectSlug, docId }),
      getProjectFeatures: (projectPath: string, projectSlug: string) =>
        this.post('/api/projects/tools/project_list_features', { projectPath, projectSlug }),
    };

    // Hivemind API — cross-instance mesh peer status
    hivemind = {
      /** Returns all known peers (online and offline) with identity, status, and capacity. */
      getPeers: (): Promise<{ peers: HivemindPeer[] }> => this.get('/api/hivemind/peers'),

      /** Returns the full sync status for this instance (role, connected, peer count, etc.). */
      getStatus: (): Promise<SyncServerStatus> => this.get('/api/hivemind/status'),

      /** Returns the instanceId of this Automaker instance. */
      getSelf: (): Promise<{ instanceId: string }> => this.get('/api/hivemind/self'),
    };
  };
