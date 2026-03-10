/**
 * DynamicAgentCard — Renders execute_dynamic_agent tool results.
 *
 * Shows role badge, prompt preview, execution status, model used, and duration.
 */

import { Loader2, Bot, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDuration } from '@protolabsai/utils';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface DynamicAgentData {
  success?: boolean;
  output?: string;
  error?: string;
  durationMs?: number;
  templateName?: string;
  model?: string;
}

function extractData(output: unknown): DynamicAgentData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as DynamicAgentData;
  }
  return o as DynamicAgentData;
}

export function DynamicAgentCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="dynamic-agent-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Executing agent…</span>
      </div>
    );
  }

  const data = extractData(output);
  if (!data) {
    return (
      <div
        data-slot="dynamic-agent-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Agent result unavailable
      </div>
    );
  }

  const success = data.success ?? false;
  const StatusIcon = success ? CheckCircle2 : XCircle;
  const statusColor = success ? 'text-green-500' : 'text-red-500';
  const statusBg = success ? 'bg-green-500/10' : 'bg-red-500/10';

  return (
    <div
      data-slot="dynamic-agent-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Dynamic Agent</span>
        {data.templateName && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {data.templateName}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <StatusIcon className={cn('size-3', statusColor)} />
          <span className={cn('rounded px-1.5 py-0.5 font-medium', statusBg, statusColor)}>
            {success ? 'Done' : 'Failed'}
          </span>
        </span>
      </div>

      {/* Body */}
      <div className="space-y-1.5 px-3 py-2">
        {/* Model + duration row */}
        <div className="flex items-center gap-3 text-muted-foreground">
          {data.model && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px]">{data.model}</span>
          )}
          {data.durationMs != null && (
            <span className="flex items-center gap-0.5">
              <Clock className="size-2.5" />
              {formatDuration(data.durationMs)}
            </span>
          )}
        </div>

        {/* Output preview */}
        {data.output && (
          <pre className="max-h-32 max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            {data.output.length > 500 ? data.output.slice(0, 500) + '…' : data.output}
          </pre>
        )}

        {/* Error */}
        {data.error && (
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-red-500/5 p-2 font-mono text-[11px] leading-relaxed text-red-500">
            {data.error}
          </pre>
        )}
      </div>
    </div>
  );
}
