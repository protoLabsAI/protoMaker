/**
 * AutoModeControlCard — Action confirmation card for start_auto_mode / stop_auto_mode tool results.
 *
 * Renders:
 * - Action taken (started / stopped)
 * - Configuration details (max concurrency, model tier)
 * - Queue depth
 *
 * Distinct from AutoModeStatusCard which shows ongoing status polling.
 */

import { Loader2, Zap, ZapOff, Settings2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface AutoModeControlData {
  action?: string;
  running?: boolean;
  active?: boolean;
  enabled?: boolean;
  status?: string;
  maxConcurrency?: number;
  concurrency?: number;
  modelTier?: string;
  model?: string;
  tier?: string;
  queueLength?: number;
  queueSize?: number;
  queue?: unknown[];
  pendingCount?: number;
  [key: string]: unknown;
}

function extractData(output: unknown): AutoModeControlData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as AutoModeControlData;
  }
  return o as AutoModeControlData;
}

function resolveAction(data: AutoModeControlData, toolName: string): 'started' | 'stopped' {
  if (data.action) {
    const a = data.action.toLowerCase();
    if (a.includes('start') || a.includes('run') || a.includes('enabl')) return 'started';
    if (a.includes('stop') || a.includes('disabl') || a.includes('halt')) return 'stopped';
  }
  // Fall back to running state
  const running =
    typeof data.running === 'boolean'
      ? data.running
      : typeof data.active === 'boolean'
        ? data.active
        : typeof data.enabled === 'boolean'
          ? data.enabled
          : typeof data.status === 'string'
            ? ['running', 'active', 'enabled', 'on'].includes(data.status.toLowerCase())
            : null;
  if (running !== null) return running ? 'started' : 'stopped';
  // Last resort: use toolName
  return toolName.includes('stop') ? 'stopped' : 'started';
}

function getQueueLength(data: AutoModeControlData): number | null {
  if (typeof data.queueLength === 'number') return data.queueLength;
  if (typeof data.queueSize === 'number') return data.queueSize;
  if (typeof data.pendingCount === 'number') return data.pendingCount;
  if (Array.isArray(data.queue)) return data.queue.length;
  return null;
}

function getMaxConcurrency(data: AutoModeControlData): number | null {
  if (typeof data.maxConcurrency === 'number') return data.maxConcurrency;
  if (typeof data.concurrency === 'number') return data.concurrency;
  return null;
}

function getModelTier(data: AutoModeControlData): string | null {
  if (typeof data.modelTier === 'string') return data.modelTier;
  if (typeof data.tier === 'string') return data.tier;
  if (typeof data.model === 'string') return data.model;
  return null;
}

export function AutoModeControlCard({ output, state, toolName }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="auto-mode-control-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>{toolName?.includes('stop') ? 'Stopping' : 'Starting'} auto mode…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="auto-mode-control-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Auto mode action unavailable
      </div>
    );
  }

  const action = resolveAction(data, toolName ?? '');
  const queueLength = getQueueLength(data);
  const maxConcurrency = getMaxConcurrency(data);
  const modelTier = getModelTier(data);

  const isStarted = action === 'started';

  return (
    <div
      data-slot="auto-mode-control-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        {isStarted ? (
          <Zap className="size-3.5 fill-current text-green-500" />
        ) : (
          <ZapOff className="size-3.5 text-muted-foreground" />
        )}
        <span className="font-medium text-foreground/80">Auto Mode</span>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 font-medium',
            isStarted
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted/80 text-muted-foreground'
          )}
        >
          {isStarted ? 'Started' : 'Stopped'}
        </span>
      </div>

      {/* Config details */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        {maxConcurrency !== null && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Settings2 className="size-3" />
            <span>Concurrency: </span>
            <span className="font-medium text-foreground/80">{maxConcurrency}</span>
          </span>
        )}
        {modelTier !== null && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <span>Model tier: </span>
            <span className="font-medium text-foreground/80">{modelTier}</span>
          </span>
        )}
        {queueLength !== null && (
          <span
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5',
              queueLength > 0
                ? 'bg-amber-500/10 text-amber-500'
                : 'bg-muted/60 text-muted-foreground'
            )}
          >
            {queueLength} in queue
          </span>
        )}
      </div>
    </div>
  );
}
