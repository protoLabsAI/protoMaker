/**
 * AutoModeStatusCard — Status pill for get_auto_mode_status tool results.
 *
 * Renders:
 * - Running / Stopped status pill
 * - Queue length badge
 */

import { Loader2, Zap, ZapOff } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface AutoModeData {
  running?: boolean;
  active?: boolean;
  enabled?: boolean;
  status?: string;
  queueLength?: number;
  queueSize?: number;
  queue?: unknown[];
  pendingCount?: number;
  [key: string]: unknown;
}

function extractData(output: unknown): AutoModeData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as AutoModeData;
  }
  return o as AutoModeData;
}

function isRunning(data: AutoModeData): boolean {
  if (typeof data.running === 'boolean') return data.running;
  if (typeof data.active === 'boolean') return data.active;
  if (typeof data.enabled === 'boolean') return data.enabled;
  if (typeof data.status === 'string') {
    return ['running', 'active', 'enabled', 'on'].includes(data.status.toLowerCase());
  }
  return false;
}

function getQueueLength(data: AutoModeData): number | null {
  if (typeof data.queueLength === 'number') return data.queueLength;
  if (typeof data.queueSize === 'number') return data.queueSize;
  if (typeof data.pendingCount === 'number') return data.pendingCount;
  if (Array.isArray(data.queue)) return data.queue.length;
  return null;
}

export function AutoModeStatusCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="auto-mode-status-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Checking auto mode…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="auto-mode-status-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Auto mode status unavailable
      </div>
    );
  }

  const running = isRunning(data);
  const queueLength = getQueueLength(data);

  return (
    <div
      data-slot="auto-mode-status-card"
      className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs"
    >
      {/* Status pill */}
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
          running
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-muted/80 text-muted-foreground'
        )}
      >
        {running ? <Zap className="size-3 fill-current" /> : <ZapOff className="size-3" />}
        {running ? 'Running' : 'Stopped'}
      </span>

      {/* Queue length badge */}
      {queueLength !== null && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
            queueLength > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-muted/60 text-muted-foreground'
          )}
        >
          {queueLength} in queue
        </span>
      )}
    </div>
  );
}
