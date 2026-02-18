/**
 * Node Detail Sections — Type-specific content for the node detail dialog.
 *
 * Each section renders data relevant to its node type using
 * existing hooks and the node's data prop.
 */

import { ExternalLink, Clock, DollarSign, Square, FileText } from 'lucide-react';
import { Badge } from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { scrubPii } from '@/lib/scrub-pii';
import { formatCostUsd } from '@/lib/format';
import { getLangfuseTraceUrl } from '@/lib/langfuse-url';
import type {
  OrchestratorNodeData,
  ServiceNodeData,
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
