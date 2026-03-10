/**
 * RunningAgentsCard — Live agent list for list_running_agents tool results.
 *
 * Renders each running agent as a row with:
 * - Feature title
 * - Agent model
 * - Elapsed time
 * - Turn count
 * - Status indicator (running / idle)
 *
 * Shows an empty state when no agents are running.
 */

import { Loader2, Bot, Clock, Hash } from 'lucide-react';
import { formatElapsed } from '@protolabsai/utils';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface RunningAgent {
  id?: string;
  featureId?: string;
  featureTitle?: string;
  model?: string;
  elapsedMs?: number;
  elapsedSeconds?: number;
  turnCount?: number;
  status?: string;
  state?: string;
  [key: string]: unknown;
}

interface ListRunningAgentsData {
  agents?: RunningAgent[];
  [key: string]: unknown;
}

function extractData(output: unknown): ListRunningAgentsData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as ListRunningAgentsData;
  }
  if ('agents' in o) return o as ListRunningAgentsData;
  return null;
}

function resolveIsIdle(status: string | undefined, state: string | undefined): boolean {
  const s = (status ?? state ?? '').toLowerCase();
  return s === 'idle' || s === 'waiting' || s === 'paused';
}

function AgentRow({ agent }: { agent: RunningAgent }) {
  const isIdle = resolveIsIdle(agent.status, agent.state);
  const elapsed =
    agent.elapsedMs ?? (agent.elapsedSeconds != null ? agent.elapsedSeconds * 1000 : undefined);

  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
      data-agent-id={agent.id ?? agent.featureId}
    >
      {/* Status indicator */}
      <Loader2
        className={cn(
          'size-3.5 shrink-0',
          isIdle ? 'text-muted-foreground' : 'animate-spin text-blue-500'
        )}
      />

      {/* Feature title */}
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
        {agent.model && (
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {agent.model}
          </span>
        )}
      </div>

      {/* Turn count */}
      {agent.turnCount != null && (
        <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <Hash className="size-2.5" />
          {agent.turnCount}
        </span>
      )}

      {/* Elapsed time */}
      {elapsed != null && (
        <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <Clock className="size-2.5" />
          {formatElapsed(elapsed)}
        </span>
      )}

      {/* Status badge */}
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 font-medium',
          isIdle ? 'bg-muted/60 text-muted-foreground' : 'bg-blue-500/10 text-blue-500'
        )}
      >
        {isIdle ? 'Idle' : 'Running'}
      </span>
    </div>
  );
}

export function RunningAgentsCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="running-agents-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading running agents…</span>
      </div>
    );
  }

  const data = extractData(output);
  const agents: RunningAgent[] = Array.isArray(data?.agents) ? data.agents : [];

  return (
    <div
      data-slot="running-agents-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Running Agents</span>
        <span className="ml-auto text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Agent rows or empty state */}
      {agents.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">No agents currently running</div>
      ) : (
        <div className="p-1">
          {agents.map((agent, i) => (
            <AgentRow key={agent.id ?? agent.featureId ?? i} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
