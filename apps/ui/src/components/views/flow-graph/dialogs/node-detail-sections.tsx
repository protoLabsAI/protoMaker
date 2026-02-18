/**
 * Node Detail Sections — Type-specific content for the node detail dialog.
 *
 * Each section renders data relevant to its node type using
 * existing hooks and the node's data prop.
 */

import {
  ExternalLink,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  Square,
  FileText,
} from 'lucide-react';
import { Badge } from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { scrubPii } from '@/lib/scrub-pii';
import { formatCostUsd } from '@/lib/format';
import { getLangfuseTraceUrl } from '@/lib/langfuse-url';
import type {
  OrchestratorNodeData,
  CrewNodeData,
  ServiceNodeData,
  IntegrationNodeData,
  FeatureNodeData,
  AgentNodeData,
} from '../types';
import type { CrewMemberStatus } from '@/hooks/queries/use-crew-status';

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

function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === 'ok'
      ? 'default'
      : severity === 'warning'
        ? 'secondary'
        : severity === 'critical' || severity === 'error'
          ? 'destructive'
          : 'outline';

  return <Badge variant={variant}>{severity}</Badge>;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
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
// Crew Section
// ============================================

export function CrewSection({
  data,
  memberStatus,
}: {
  data: CrewNodeData;
  memberStatus?: CrewMemberStatus;
}) {
  const findings = memberStatus?.lastCheck?.result?.findings ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <SectionRow label="Status">
          <Badge variant={data.enabled ? 'default' : 'outline'}>
            {data.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </SectionRow>
        {data.isRunning && (
          <SectionRow label="State">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Activity className="w-3 h-3 animate-pulse" />
              Running check
            </span>
          </SectionRow>
        )}
        <SectionRow label="Last Check">{formatTimestamp(data.lastCheckTime)}</SectionRow>
        {data.lastSeverity && (
          <SectionRow label="Last Severity">
            <SeverityBadge severity={data.lastSeverity} />
          </SectionRow>
        )}
        {memberStatus && (
          <>
            <SectionRow label="Schedule">{memberStatus.schedule}</SectionRow>
            <SectionRow label="Checks Run">{memberStatus.checkCount}</SectionRow>
            <SectionRow label="Escalations">{memberStatus.escalationCount}</SectionRow>
          </>
        )}
      </div>

      {/* Findings list */}
      {findings.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Last Findings
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1 px-2 rounded bg-muted/30">
                {f.severity === 'ok' ? (
                  <CheckCircle className="w-3 h-3 mt-0.5 text-emerald-400 shrink-0" />
                ) : f.severity === 'warning' ? (
                  <AlertTriangle className="w-3 h-3 mt-0.5 text-amber-400 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 mt-0.5 text-red-400 shrink-0" />
                )}
                <span className="text-foreground/80">{scrubPii(f.message)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last escalation */}
      {memberStatus?.lastEscalation && (
        <div className="text-xs text-muted-foreground">
          Last escalation: {formatTimestamp(memberStatus.lastEscalation.timestamp)} (
          {formatDuration(memberStatus.lastEscalation.durationMs)})
        </div>
      )}
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
