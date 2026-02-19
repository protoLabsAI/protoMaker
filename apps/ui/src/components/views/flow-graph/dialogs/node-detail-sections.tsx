/**
 * Node Detail Sections — Type-specific content for the node detail dialog.
 *
 * Each section renders data relevant to its node type using
 * existing hooks and the node's data prop.
 */

import { ExternalLink, Clock, DollarSign, Square, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { scrubPii } from '@/lib/scrub-pii';
import { formatCostUsd } from '@/lib/format';
import { getLangfuseTraceUrl } from '@/lib/langfuse-url';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  OrchestratorNodeData,
  ServiceNodeData,
  EngineServiceNodeData,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
} from '../types';

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

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

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
      </div>

      {/* Per-service detail panel */}
      {data.serviceId === 'auto-mode' && <AutoModeDetailPanel />}
      {data.serviceId === 'pr-feedback' && <PRFeedbackDetailPanel />}
      {data.serviceId === 'lead-engineer-rules' && <LeadEngineerDetailPanel />}
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
    </div>
  );
}
