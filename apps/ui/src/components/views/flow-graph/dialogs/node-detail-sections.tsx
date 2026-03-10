/**
 * Node Detail Sections — Type-specific content for the node detail dialog.
 *
 * Each section renders data relevant to its node type using
 * existing hooks and the node's data prop.
 */

import { useState } from 'react';
import {
  ExternalLink,
  Clock,
  DollarSign,
  Square,
  FileText,
  GitBranch,
  Signal,
  Check,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { scrubPii } from '@/lib/scrub-pii';
import { formatCostUsd } from '@/lib/format';
import { formatDuration } from '@protolabsai/utils';
import { getLangfuseTraceUrl, getLangfuseSpanUrl } from '@/lib/langfuse-url';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { useEngineStatus } from '@/hooks/queries/use-metrics';
import { useAppStore } from '@/store/app-store';
import type {
  OrchestratorNodeData,
  ServiceNodeData,
  EngineServiceNodeData,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
  PipelineStageNodeData,
} from '../types';
import { PipelineMonitor } from './pipeline-monitor';
import { TimelineVisualization } from './timeline-visualization';
import type { PipelineState, PipelinePhase } from '@protolabsai/types';

// ============================================
// Shared helpers
// ============================================

function SectionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{children}</span>
    </div>
  );
}

function TraceLink({ traceId }: { traceId: string }) {
  return (
    <a
      href={getLangfuseTraceUrl(traceId)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
    >
      <ExternalLink className="w-3 h-3" />
      View Trace
    </a>
  );
}

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

/** Engine status scoped to the current project — ensures cache hit with the parent flow graph. */
function useProjectEngineStatus() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  return useEngineStatus(projectPath);
}

const COMPLEXITY_COLORS: Record<string, string> = {
  small: 'text-emerald-400',
  medium: 'text-amber-400',
  large: 'text-orange-400',
  architectural: 'text-red-400',
};

// ============================================
// Orchestrator Section
// ============================================

export function OrchestratorSection({ data }: { data: OrchestratorNodeData }) {
  return (
    <div className="space-y-1">
      <SectionRow label="Status">
        <Badge variant={data.status === 'active' ? 'default' : 'secondary'}>{data.status}</Badge>
      </SectionRow>
      <SectionRow label="Running Agents">{data.agentCount}</SectionRow>
      <SectionRow label="Active Features">{data.featureCount}</SectionRow>
      <SectionRow label="Auto-Mode">
        <Badge variant={data.autoModeRunning ? 'default' : 'outline'}>
          {data.autoModeRunning ? 'Running' : 'Stopped'}
        </Badge>
      </SectionRow>
    </div>
  );
}

// ============================================
// Service Section
// ============================================

export function ServiceSection({ data }: { data: ServiceNodeData }) {
  return (
    <div className="space-y-1">
      <SectionRow label="Type">
        <Badge variant="outline">{data.serviceType}</Badge>
      </SectionRow>
      <SectionRow label="Status">
        <Badge variant={data.running ? 'default' : 'secondary'}>
          {data.running ? 'Running' : 'Stopped'}
        </Badge>
      </SectionRow>
      {data.serviceType === 'auto-mode' && (
        <SectionRow label="Queue Depth">{data.queueDepth}</SectionRow>
      )}
    </div>
  );
}

// ============================================
// Engine Service Section
// ============================================

export function EngineServiceSection({ data }: { data: EngineServiceNodeData }) {
  return (
    <div className="space-y-3">
      {/* Common info */}
      <div className="space-y-1">
        <SectionRow label="Service">
          <Badge variant="outline">{data.serviceId}</Badge>
        </SectionRow>
        <SectionRow label="Status">
          <Badge
            variant={
              data.status === 'active'
                ? 'default'
                : data.status === 'error'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {data.status}
          </Badge>
        </SectionRow>
        {data.throughput > 0 && <SectionRow label="Active Items">{data.throughput}</SectionRow>}
        {data.statusLine && <SectionRow label="Info">{data.statusLine}</SectionRow>}
        {data.pipelineTraceId && (
          <SectionRow label="Pipeline Trace">
            <a
              href={
                data.pipelineSpanId
                  ? getLangfuseSpanUrl(data.pipelineTraceId, data.pipelineSpanId)
                  : getLangfuseTraceUrl(data.pipelineTraceId)
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View in Langfuse
            </a>
          </SectionRow>
        )}
      </div>

      {/* Per-service detail panel */}
      {data.serviceId === 'auto-mode' && <AutoModeDetailPanel />}
      {data.serviceId === 'agent-execution' && <AgentExecutionDetailPanel />}
      {data.serviceId === 'pr-feedback' && <PRFeedbackDetailPanel />}
      {data.serviceId === 'lead-engineer-rules' && <LeadEngineerDetailPanel />}
      {data.serviceId === 'signal-sources' && <SignalSourcesDetailPanel />}
      {data.serviceId === 'triage' && <TriageDetailPanel />}
      {data.serviceId === 'git-workflow' && <GitWorkflowDetailPanel />}
      {data.serviceId === 'launch' && <LaunchDetailPanel />}
      {data.serviceId === 'content-pipeline' && <ContentPipelineDetailPanel />}
      {data.serviceId === 'project-planning' && <ProjectPlanningDetailPanel />}
      {data.serviceId === 'decomposition' && <DecompositionDetailPanel />}
    </div>
  );
}

function AutoModeDetailPanel() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.engine.autoModeDetail(),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.autoModeDetail();
    },
    staleTime: 5000,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  const detail = data as
    | {
        agents?: Array<{
          featureId: string;
          title?: string;
          model?: string;
          duration?: number;
          costUsd?: number;
        }>;
        activeWorktrees?: Array<{ projectPath: string; branchName?: string }>;
      }
    | undefined;

  const agents = detail?.agents ?? [];

  if (agents.length === 0) {
    return <p className="text-xs text-muted-foreground">No agents running</p>;
  }

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Running Agents
      </p>
      {agents.map((agent) => (
        <div key={agent.featureId} className="text-xs space-y-0.5 p-2 rounded-lg bg-muted/30">
          <p className="font-medium truncate">{agent.title || agent.featureId}</p>
          <div className="flex items-center gap-3 text-muted-foreground">
            {agent.model && <span>{agent.model}</span>}
            {typeof agent.duration === 'number' && (
              <span className="tabular-nums">{formatDuration(agent.duration)}</span>
            )}
            {typeof agent.costUsd === 'number' && agent.costUsd > 0 && (
              <span className="text-emerald-400">{formatCostUsd(agent.costUsd)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PRFeedbackDetailPanel() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.engine.prFeedbackDetail(),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.prFeedbackDetail();
    },
    staleTime: 5000,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  const detail = data as
    | {
        trackedPRs?: Array<{
          featureId: string;
          prNumber: number;
          prUrl: string;
          reviewState: string;
          iterationCount: number;
        }>;
        byState?: Record<string, number>;
      }
    | undefined;

  const prs = detail?.trackedPRs ?? [];
  const byState = detail?.byState;

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Tracked PRs
      </p>
      {byState && (
        <div className="flex items-center gap-2 text-[10px]">
          {Object.entries(byState)
            .filter(([, count]) => count > 0)
            .map(([state, count]) => (
              <Badge key={state} variant="outline" className="text-[10px]">
                {state}: {count}
              </Badge>
            ))}
        </div>
      )}
      {prs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No PRs being tracked</p>
      ) : (
        prs.map((pr) => (
          <div key={pr.prNumber} className="text-xs space-y-0.5 p-2 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <a
                href={pr.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-violet-400 hover:text-violet-300"
              >
                #{pr.prNumber}
              </a>
              <Badge
                variant={pr.reviewState === 'approved' ? 'default' : 'outline'}
                className="text-[10px]"
              >
                {pr.reviewState}
              </Badge>
            </div>
            <p className="text-muted-foreground">Iteration {pr.iterationCount}/2</p>
          </div>
        ))
      )}
    </div>
  );
}

function LeadEngineerDetailPanel() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.engine.leadEngineerDetail(),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.leadEngineerDetail();
    },
    staleTime: 5000,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  const detail = data as
    | {
        sessions?: Array<{
          projectSlug: string;
          flowState: string;
          startedAt: string;
          actionsTaken: number;
          worldState?: { boardCounts?: Record<string, number>; agentCount?: number };
          ruleLog?: Array<{
            ruleName: string;
            actions: Array<{ type: string }>;
            timestamp: string;
          }>;
        }>;
      }
    | undefined;

  const sessions = detail?.sessions ?? [];

  if (sessions.length === 0) {
    return <p className="text-xs text-muted-foreground">No active sessions</p>;
  }

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Active Sessions
      </p>
      {sessions.map((session) => (
        <div key={session.projectSlug} className="text-xs space-y-1 p-2 rounded-lg bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="font-medium">{session.projectSlug}</span>
            <Badge variant="outline" className="text-[10px]">
              {session.flowState}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {session.actionsTaken} actions since {new Date(session.startedAt).toLocaleTimeString()}
          </p>
          {session.worldState?.boardCounts && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {Object.entries(session.worldState.boardCounts)
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <span key={status}>
                    {status}: {count}
                  </span>
                ))}
            </div>
          )}
          {session.ruleLog && session.ruleLog.length > 0 && (
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] text-muted-foreground font-medium">Recent Rules:</p>
              {session.ruleLog.slice(-3).map((entry, i) => (
                <p key={i} className="text-[10px] text-muted-foreground truncate">
                  {entry.ruleName} ({entry.actions.length} actions)
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SignalSourcesDetailPanel() {
  const { data: engineStatus } = useProjectEngineStatus() as {
    data?: {
      signalIntake?: {
        signalCounts?: Record<string, number>;
        lastSignalAt?: string | null;
      };
    };
  };

  const signalCounts = engineStatus?.signalIntake?.signalCounts;
  const lastSignalAt = engineStatus?.signalIntake?.lastSignalAt;
  const totalSignals = signalCounts
    ? Object.values(signalCounts).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Signal History
      </p>
      {totalSignals === 0 ? (
        <p className="text-xs text-muted-foreground">No signals received yet</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {signalCounts &&
              Object.entries(signalCounts)
                .filter(([, count]) => count > 0)
                .map(([source, count]) => (
                  <Badge key={source} variant="outline" className="text-[10px]">
                    <Signal className="w-2.5 h-2.5 mr-1" />
                    {source}: {count}
                  </Badge>
                ))}
          </div>
          {lastSignalAt && (
            <p className="text-[10px] text-muted-foreground">
              Last signal: {formatTimeAgo(lastSignalAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function GitWorkflowDetailPanel() {
  const { data: engineStatus } = useProjectEngineStatus() as {
    data?: {
      gitWorkflow?: {
        activeWorkflows?: number;
        recentOperations?: Array<{
          type: string;
          featureId?: string;
          timestamp: string;
          success?: boolean;
        }>;
      };
    };
  };

  const activeWorkflows = engineStatus?.gitWorkflow?.activeWorkflows ?? 0;
  const recentOps = engineStatus?.gitWorkflow?.recentOperations ?? [];

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Git Operations
      </p>
      <SectionRow label="Active Workflows">{activeWorkflows}</SectionRow>
      {recentOps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent operations</p>
      ) : (
        <div className="space-y-1">
          {recentOps.slice(0, 5).map((op, i) => (
            <div
              key={i}
              className="text-xs flex items-center justify-between p-1.5 rounded bg-muted/30"
            >
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium">{op.type}</span>
                {op.success === false && (
                  <Badge variant="destructive" className="text-[9px] px-1 py-0">
                    failed
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {formatTimeAgo(op.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentExecutionDetailPanel() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.engine.autoModeDetail(),
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.autoModeDetail();
    },
    staleTime: 5000,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  const detail = data as
    | {
        agents?: Array<{
          featureId: string;
          title?: string;
          model?: string;
          duration?: number;
          costUsd?: number;
          branchName?: string;
          projectName?: string;
        }>;
      }
    | undefined;

  const agents = detail?.agents ?? [];

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Active Agents
      </p>
      {agents.length === 0 ? (
        <p className="text-xs text-muted-foreground">No agents running</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
          {agents.map((agent) => (
            <div key={agent.featureId} className="text-xs space-y-0.5 p-2 rounded-lg bg-muted/30">
              <p className="font-medium truncate">{agent.title || agent.featureId}</p>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                {agent.model && (
                  <Badge variant="outline" className="text-[10px]">
                    {agent.model}
                  </Badge>
                )}
                {typeof agent.duration === 'number' && (
                  <span className="tabular-nums text-[10px]">{formatDuration(agent.duration)}</span>
                )}
                {typeof agent.costUsd === 'number' && agent.costUsd > 0 && (
                  <span className="text-emerald-400 text-[10px]">
                    {formatCostUsd(agent.costUsd)}
                  </span>
                )}
              </div>
              {agent.branchName && (
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded truncate block max-w-[200px]">
                  {agent.branchName}
                </code>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TriageDetailPanel() {
  const { data: engineStatus } = useProjectEngineStatus() as {
    data?: {
      signalIntake?: {
        signalCounts?: Record<string, number>;
        lastSignalAt?: string | null;
      };
    };
  };

  const signalCounts = engineStatus?.signalIntake?.signalCounts;
  const totalSignals = signalCounts
    ? Object.values(signalCounts).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Signal Classification
      </p>
      {totalSignals === 0 ? (
        <p className="text-xs text-muted-foreground">No signals classified yet</p>
      ) : (
        <>
          <SectionRow label="Total Classified">{totalSignals}</SectionRow>
          <div className="space-y-1">
            {signalCounts &&
              Object.entries(signalCounts)
                .filter(([, count]) => count > 0)
                .map(([source, count]) => (
                  <div
                    key={source}
                    className="text-xs flex items-center justify-between p-1.5 rounded bg-muted/30"
                  >
                    <span className="capitalize">{source}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </div>
                ))}
          </div>
        </>
      )}
    </div>
  );
}

function LaunchDetailPanel() {
  const { data: engineStatus } = useProjectEngineStatus() as {
    data?: {
      autoMode?: {
        running?: boolean;
        runningAgents?: number;
        queueDepth?: number;
        runningFeatures?: string[];
      };
    };
  };

  const am = engineStatus?.autoMode;

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Launch Queue
      </p>
      <SectionRow label="Auto-Mode">
        <Badge variant={am?.running ? 'default' : 'secondary'}>
          {am?.running ? 'Running' : 'Stopped'}
        </Badge>
      </SectionRow>
      <SectionRow label="Agents Active">{am?.runningAgents ?? 0}</SectionRow>
      <SectionRow label="Queued">{am?.queueDepth ?? 0}</SectionRow>
      {am?.runningFeatures && am.runningFeatures.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium">In Flight:</p>
          {am.runningFeatures.map((fId) => (
            <div key={fId} className="text-[10px] p-1 rounded bg-muted/30 truncate">
              {fId}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ContentFlow {
  runId: string;
  status: string;
  progress: number;
  currentNode?: string;
  topic?: string;
  reviewScores?: {
    research?: { percentage: number; passed: boolean };
    outline?: { percentage: number; passed: boolean };
    content?: { percentage: number; passed: boolean };
  };
  traceId?: string;
  createdAt: number;
  completedAt?: number;
}

function ContentPipelineDetailPanel() {
  const { data: engineStatus } = useProjectEngineStatus() as {
    data?: {
      contentPipeline?: {
        activeFlows?: ContentFlow[];
        recentFlows?: ContentFlow[];
        totalActive?: number;
        pendingDrafts?: number;
      };
    };
  };

  const { data: draftsData } = useQuery({
    queryKey: ['engine', 'content', 'drafts'],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.contentDrafts();
    },
    staleTime: 10000,
  });

  const cp = engineStatus?.contentPipeline;
  const activeFlows = cp?.activeFlows ?? [];
  const recentFlows = cp?.recentFlows ?? [];
  const drafts =
    (
      draftsData as {
        drafts?: Array<{ contentId: string; title: string; status: string; createdAt: string }>;
      }
    )?.drafts ?? [];

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Content Pipeline
      </p>
      <SectionRow label="Active Flows">{cp?.totalActive ?? 0}</SectionRow>
      <SectionRow label="Pending Review">{cp?.pendingDrafts ?? 0}</SectionRow>

      {/* Active content flows */}
      {activeFlows.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">Active:</p>
          {activeFlows.map((flow) => (
            <ContentFlowCard key={flow.runId} flow={flow} />
          ))}
        </div>
      )}

      {/* Recently completed flows */}
      {recentFlows.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">Recent:</p>
          {recentFlows.slice(0, 5).map((flow) => (
            <ContentFlowCard key={flow.runId} flow={flow} />
          ))}
        </div>
      )}

      {/* GTM drafts */}
      {drafts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">Drafts:</p>
          {drafts.slice(0, 5).map((draft) => (
            <div key={draft.contentId} className="text-xs p-2 rounded-lg bg-muted/30 space-y-0.5">
              <p className="font-medium truncate">{draft.title}</p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {draft.status}
                </Badge>
                <span className="text-[10px]">{formatTimeAgo(draft.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {drafts.length === 0 && activeFlows.length === 0 && recentFlows.length === 0 && (
        <p className="text-xs text-muted-foreground">No active content flows</p>
      )}
    </div>
  );
}

function ContentFlowCard({ flow }: { flow: ContentFlow }) {
  const statusColor =
    flow.status === 'completed'
      ? 'text-emerald-400'
      : flow.status === 'failed'
        ? 'text-red-400'
        : 'text-blue-400';

  return (
    <div className="text-xs p-2 rounded-lg bg-muted/30 space-y-1">
      <p className="font-medium truncate" title={flow.topic}>
        {flow.topic || flow.runId}
      </p>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
          {flow.currentNode || flow.status}
        </Badge>
        <span className="text-[10px] tabular-nums">{flow.progress}%</span>
        <span className="text-[10px]">{formatTimeAgo(new Date(flow.createdAt).toISOString())}</span>
      </div>
      {/* Progress bar */}
      {flow.status !== 'completed' && flow.status !== 'failed' && (
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${flow.progress}%` }}
          />
        </div>
      )}
      {/* Review scores */}
      {flow.reviewScores && (
        <div className="flex items-center gap-2 text-[10px]">
          {flow.reviewScores.research && (
            <span
              className={flow.reviewScores.research.passed ? 'text-emerald-400' : 'text-amber-400'}
            >
              R: {flow.reviewScores.research.percentage}%
            </span>
          )}
          {flow.reviewScores.outline && (
            <span
              className={flow.reviewScores.outline.passed ? 'text-emerald-400' : 'text-amber-400'}
            >
              O: {flow.reviewScores.outline.percentage}%
            </span>
          )}
          {flow.reviewScores.content && (
            <span
              className={flow.reviewScores.content.passed ? 'text-emerald-400' : 'text-amber-400'}
            >
              C: {flow.reviewScores.content.percentage}%
            </span>
          )}
        </div>
      )}
      {/* Langfuse trace link */}
      {flow.traceId && <TraceLink traceId={flow.traceId} />}
    </div>
  );
}

function ProjectPlanningDetailPanel() {
  const { data: engineStatus } = useProjectEngineStatus() as {
    data?: {
      projectLifecycle?: {
        totalProjects?: number;
        activeProjects?: number;
        activePRDs?: number;
      };
    };
  };

  const pl = engineStatus?.projectLifecycle;

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Project Planning
      </p>
      {!pl ? (
        <p className="text-xs text-muted-foreground">No project data available</p>
      ) : (
        <>
          <SectionRow label="Total Projects">{pl.totalProjects ?? 0}</SectionRow>
          <SectionRow label="Active">{pl.activeProjects ?? 0}</SectionRow>
          <SectionRow label="PRDs In Progress">{pl.activePRDs ?? 0}</SectionRow>
        </>
      )}
    </div>
  );
}

function DecompositionDetailPanel() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.projects.list(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) return { success: false, projects: [] as ProjectDetail[] };
      const api = getHttpApiClient();
      const listRes = await api.lifecycle.listProjects(projectPath);
      if (!listRes.success || !listRes.projects?.length)
        return { success: true, projects: [] as ProjectDetail[] };
      const details = await Promise.all(
        listRes.projects.map(async (slug) => {
          const res = await api.lifecycle.getProject(projectPath, slug);
          return res.project ?? { slug, title: slug, status: 'unknown', milestones: [] };
        })
      );
      return { success: true, projects: details };
    },
    enabled: !!projectPath,
    staleTime: 10000,
  });

  const completeMutation = useMutation({
    mutationFn: async (slug: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.updateProject(projectPath!, slug, { status: 'completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(projectPath ?? '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.engine.status(projectPath) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.deleteProject(projectPath!, slug);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(projectPath ?? '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.engine.status(projectPath) });
    },
  });

  const projects = (data as { projects?: ProjectDetail[] })?.projects ?? [];

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading projects...</p>;

  return (
    <div className="border-t border-border/30 pt-2 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Projects ({projects.length})
      </p>
      {projects.length === 0 ? (
        <p className="text-xs text-muted-foreground">No projects found</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
          {projects.map((project) => (
            <div key={project.slug} className="text-xs p-2 rounded-lg bg-muted/30 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium truncate flex-1" title={project.title}>
                  {project.title || project.slug}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  {project.status !== 'completed' && (
                    <button
                      className="p-0.5 rounded hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 transition-colors disabled:opacity-50"
                      title="Mark completed"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(project.slug)}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete project"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Delete project "${project.title || project.slug}"?`)) {
                        deleteMutation.mutate(project.slug);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Badge
                  variant={
                    project.status === 'active'
                      ? 'default'
                      : project.status === 'completed'
                        ? 'secondary'
                        : 'outline'
                  }
                  className="text-[10px]"
                >
                  {project.status}
                </Badge>
                {project.milestones && project.milestones.length > 0 && (
                  <span className="text-[10px]">
                    {project.milestones.length} milestone
                    {project.milestones.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProjectDetail {
  slug: string;
  title: string;
  status: string;
  milestones?: Array<{ title: string; phases: Array<{ title: string; status?: string }> }>;
}

// ============================================
// Integration Section
// ============================================

export function IntegrationSection({ data }: { data: IntegrationNodeData }) {
  return (
    <div className="space-y-1">
      <SectionRow label="Integration">
        <Badge variant="outline">{data.integrationType}</Badge>
      </SectionRow>
      <SectionRow label="Connected">
        <Badge variant={data.connected ? 'default' : 'destructive'}>
          {data.connected ? 'Yes' : 'No'}
        </Badge>
      </SectionRow>
      <SectionRow label="Status">{scrubPii(data.status)}</SectionRow>
    </div>
  );
}

// ============================================
// Feature Section
// ============================================

export function FeatureSection({ data }: { data: FeatureNodeData }) {
  return (
    <div className="space-y-1">
      <SectionRow label="Status">
        <Badge
          variant={
            data.status === 'done'
              ? 'default'
              : data.status === 'in_progress'
                ? 'secondary'
                : 'outline'
          }
        >
          {data.status}
        </Badge>
      </SectionRow>
      {data.branchName && (
        <SectionRow label="Branch">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{data.branchName}</code>
        </SectionRow>
      )}
      {data.progress !== undefined && (
        <SectionRow label="Progress">{Math.round(data.progress * 100)}%</SectionRow>
      )}
      {data.lastTraceId && (
        <SectionRow label="Trace">
          <TraceLink traceId={data.lastTraceId} />
        </SectionRow>
      )}
    </div>
  );
}

// ============================================
// Agent Section
// ============================================

interface AgentSectionProps {
  data: AgentNodeData;
  onStop?: () => void;
  onViewLogs?: () => void;
  isStopping?: boolean;
}

export function AgentSection({ data, onStop, onViewLogs, isStopping }: AgentSectionProps) {
  const elapsed = Date.now() - data.startTime;
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  // Access pipeline state if available
  const pipelineState = (
    data as AgentNodeData & {
      pipelineState?: PipelineState & {
        phaseDurations?: Partial<Record<string, number>>;
        toolExecutions?: Array<{
          name: string;
          icon?: string;
          duration?: number;
          phase?: string;
          timestamp?: string;
          success?: boolean;
        }>;
      };
    }
  ).pipelineState;

  const hasTimelineData = pipelineState?.phaseHistory && pipelineState.phaseHistory.length > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {data.description && (
          <SectionRow label="Description">
            <span className="text-xs max-w-[200px] truncate" title={scrubPii(data.description)}>
              {scrubPii(data.description)}
            </span>
          </SectionRow>
        )}
        {data.model && (
          <SectionRow label="Model">
            <Badge variant="outline">{data.model}</Badge>
          </SectionRow>
        )}
        <SectionRow label="Mode">
          <Badge variant={data.isAutoMode ? 'default' : 'secondary'}>
            {data.isAutoMode ? 'Auto' : 'Manual'}
          </Badge>
        </SectionRow>
        <SectionRow label="Running For">
          <span className="flex items-center gap-1.5 tabular-nums">
            <Clock className="w-3 h-3" />
            {formatDuration(elapsed)}
          </span>
        </SectionRow>
        {typeof data.costUsd === 'number' && data.costUsd > 0 && (
          <SectionRow label="Cost">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <DollarSign className="w-3 h-3" />
              {formatCostUsd(data.costUsd)}
            </span>
          </SectionRow>
        )}
        {data.projectName && <SectionRow label="Project">{data.projectName}</SectionRow>}
        {data.traceId && (
          <SectionRow label="Trace">
            <TraceLink traceId={data.traceId} />
          </SectionRow>
        )}
      </div>

      {/* Action buttons */}
      {(onViewLogs || onStop) && (
        <div className="flex items-center gap-2 pt-1">
          {onViewLogs && (
            <Button variant="outline" size="sm" className="flex-1" onClick={onViewLogs}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              View Logs
            </Button>
          )}
          {onStop && (
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={onStop}
              disabled={isStopping}
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Stop Agent
            </Button>
          )}
        </div>
      )}

      {/* Execution Timeline (expandable) */}
      {hasTimelineData && (
        <div className="border-t border-border/30 pt-2">
          <button
            onClick={() => setTimelineExpanded(!timelineExpanded)}
            className="flex items-center justify-between w-full text-left group"
          >
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold group-hover:text-foreground transition-colors">
              Execution Timeline
            </span>
            {timelineExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </button>
          {timelineExpanded && (
            <div className="mt-2">
              <TimelineVisualization
                phaseDurations={
                  pipelineState.phaseDurations as Partial<Record<PipelinePhase, number>> | undefined
                }
                toolExecutions={
                  pipelineState.toolExecutions as
                    | Array<{
                        name: string;
                        icon?: string;
                        duration?: number;
                        phase?: PipelinePhase;
                        timestamp?: string;
                        success?: boolean;
                      }>
                    | undefined
                }
                phaseHistory={pipelineState.phaseHistory}
                phaseSpanIds={pipelineState.phaseSpanIds}
                traceId={pipelineState.traceId}
                gateWaitingSince={pipelineState.gateWaitingSince}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Pipeline Stage Section
// ============================================

export function PipelineStageSection({ data }: { data: PipelineStageNodeData }) {
  const hasRealItems = data.workItems.some((item) => !item.metadata?.isInitial);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <SectionRow label="Stage">
          <Badge variant="outline">{data.stageId}</Badge>
        </SectionRow>
        <SectionRow label="Status">
          <Badge
            variant={
              data.status === 'active'
                ? 'default'
                : data.status === 'blocked'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {data.status}
          </Badge>
        </SectionRow>
        <SectionRow label="Features">{data.workItems.length}</SectionRow>
      </div>

      {/* Feature cards */}
      {data.workItems.length > 0 && (
        <div className="border-t border-border/30 pt-2 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {hasRealItems ? 'Features' : 'Items'}
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
            {data.workItems.map((item) => (
              <div key={item.id} className="text-xs space-y-1 p-2 rounded-lg bg-muted/30">
                <p className="font-medium truncate" title={item.title}>
                  {item.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  {item.metadata?.complexity && (
                    <span
                      className={`text-[10px] font-medium ${COMPLEXITY_COLORS[item.metadata.complexity] || ''}`}
                    >
                      {item.metadata.complexity}
                    </span>
                  )}
                  {item.metadata?.branchName && (
                    <code className="text-[10px] bg-muted px-1 py-0.5 rounded truncate max-w-[140px]">
                      {item.metadata.branchName}
                    </code>
                  )}
                  {typeof item.metadata?.costUsd === 'number' && item.metadata.costUsd > 0 && (
                    <span className="text-emerald-400 text-[10px]">
                      {formatCostUsd(item.metadata.costUsd)}
                    </span>
                  )}
                  {item.metadata?.createdAt && (
                    <span className="text-[10px]">
                      <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                      {formatTimeAgo(item.metadata.createdAt)}
                    </span>
                  )}
                </div>
                {item.metadata?.lastTraceId && <TraceLink traceId={item.metadata.lastTraceId} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline monitor for each active work item */}
      {data.workItems
        .filter((item) => item.status === 'in_progress')
        .slice(0, 3)
        .map((item) => (
          <PipelineMonitor key={item.id} featureId={item.id} />
        ))}
    </div>
  );
}
