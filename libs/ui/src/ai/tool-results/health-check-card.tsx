/**
 * HealthCheckCard — Status card for health_check tool results.
 *
 * Renders overall health status with a pass/fail indicator.
 */

import { Loader2, Heart, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface HealthData {
  healthy?: boolean;
  status?: string;
  ok?: boolean;
  [key: string]: unknown;
}

function extractData(output: unknown): HealthData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as HealthData;
  }
  return o as HealthData;
}

function isHealthy(data: HealthData): boolean {
  if (typeof data.healthy === 'boolean') return data.healthy;
  if (typeof data.ok === 'boolean') return data.ok;
  if (typeof data.status === 'string') {
    return ['healthy', 'ok', 'pass', 'up', 'running'].includes(data.status.toLowerCase());
  }
  return true;
}

export function HealthCheckCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="health-check-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Running health check…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="health-check-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Health check status unavailable
      </div>
    );
  }

  const healthy = isHealthy(data);

  return (
    <div
      data-slot="health-check-card"
      className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs"
    >
      <Heart className="size-3.5 text-muted-foreground" />
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
          healthy
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        )}
      >
        {healthy ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
        {healthy ? 'Healthy' : 'Unhealthy'}
      </span>
    </div>
  );
}
