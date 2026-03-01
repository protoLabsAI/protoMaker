/**
 * AgentStatusCard — Running/stopped agent state for start_agent / stop_agent tool results.
 *
 * Renders:
 * - Agent state indicator (Running / Stopped / Done)
 * - Feature title and ID context
 * - Elapsed time when available
 */

import { Loader2, Bot, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface AgentInfo {
  id?: string;
  featureId?: string;
  featureTitle?: string;
  status?: string;
  state?: string;
  elapsedMs?: number;
  elapsedSeconds?: number;
  startedAt?: string;
  [key: string]: unknown;
}

interface AgentStatusData {
  agent?: AgentInfo;
  agents?: AgentInfo[];
  featureId?: string;
  featureTitle?: string;
  status?: string;
  state?: string;
  elapsedMs?: number;
  [key: string]: unknown;
}

function extractData(output: unknown): AgentStatusData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as AgentStatusData;
  }
  if ('agent' in o || 'agents' in o || 'featureId' in o) return o as AgentStatusData;
  return o as AgentStatusData;
}

/** Format elapsed milliseconds into a human-readable string */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

type AgentDisplayStatus = 'running' | 'stopped' | 'done' | 'error' | 'unknown';

function resolveStatus(status: string | undefined, state: string | undefined): AgentDisplayStatus {
  const s = (status ?? state ?? '').toLowerCase();
  if (s === 'running' || s === 'active' || s === 'started') return 'running';
  if (s === 'stopped' || s === 'cancelled' || s === 'canceled') return 'stopped';
  if (s === 'done' || s === 'completed' || s === 'finished' || s === 'success') return 'done';
  if (s === 'error' || s === 'failed' || s === 'failure') return 'error';
  return 'unknown';
}

const STATUS_UI: Record<
  AgentDisplayStatus,
  { label: string; icon: typeof Bot; color: string; bg: string }
> = {
  running: { label: 'Running', icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  stopped: { label: 'Stopped', icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/60' },
  done: { label: 'Done', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  unknown: { label: 'Unknown', icon: Bot, color: 'text-muted-foreground', bg: 'bg-muted/60' },
};

function AgentRow({ agent }: { agent: AgentInfo }) {
  const displayStatus = resolveStatus(agent.status, agent.state);
  const ui = STATUS_UI[displayStatus];
  const Icon = ui.icon;
  const elapsed =
    agent.elapsedMs ?? (agent.elapsedSeconds != null ? agent.elapsedSeconds * 1000 : undefined);

  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
      data-agent-id={agent.id ?? agent.featureId}
    >
      {/* Status icon */}
      <Icon
        className={cn('size-3.5 shrink-0', ui.color, displayStatus === 'running' && 'animate-spin')}
      />

      {/* Feature context */}
      <div className="min-w-0 flex-1">
        {agent.featureTitle ? (
          <span className="block truncate text-foreground/80">{agent.featureTitle}</span>
        ) : agent.featureId ? (
          <span className="block font-mono text-[10px] text-muted-foreground">
            {agent.featureId}
          </span>
        ) : (
          <span className="text-muted-foreground">Unknown feature</span>
        )}
      </div>

      {/* Elapsed time */}
      {elapsed != null && (
        <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <Clock className="size-2.5" />
          {formatElapsed(elapsed)}
        </span>
      )}

      {/* Status badge */}
      <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-medium', ui.bg, ui.color)}>
        {ui.label}
      </span>
    </div>
  );
}

export function AgentStatusCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="agent-status-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Updating agent…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="agent-status-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Agent status unavailable
      </div>
    );
  }

  // Collect agents to display: multi-agent list or single agent
  const agents: AgentInfo[] = [];
  if (Array.isArray(data.agents) && data.agents.length > 0) {
    agents.push(...data.agents);
  } else if (data.agent) {
    agents.push(data.agent);
  } else {
    // The data itself might represent a single agent
    agents.push({
      featureId: data.featureId,
      featureTitle: data.featureTitle,
      status: data.status,
      state: data.state,
      elapsedMs: data.elapsedMs,
    });
  }

  return (
    <div
      data-slot="agent-status-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Agent Status</span>
        <span className="ml-auto text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Agent rows */}
      <div className="p-1">
        {agents.map((agent, i) => (
          <AgentRow key={agent.id ?? agent.featureId ?? i} agent={agent} />
        ))}
      </div>
    </div>
  );
}
