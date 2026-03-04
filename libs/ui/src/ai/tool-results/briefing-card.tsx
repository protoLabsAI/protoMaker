/**
 * BriefingCard — Renders get_briefing tool results.
 *
 * Shows event summary grouped by severity with counts and timestamps.
 */

import { Loader2, FileText, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface BriefingSignal {
  id?: string;
  trigger?: string;
  featureName?: string;
  error?: string;
  timestamp?: string;
}

interface BriefingData {
  since?: string;
  totalEvents?: number;
  summary?: Record<string, number>;
  signals?: Record<string, BriefingSignal[]>;
}

function extractData(output: unknown): BriefingData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as BriefingData;
  }
  return o as BriefingData;
}

const SEVERITY_CONFIG: Record<
  string,
  { label: string; icon: typeof AlertCircle; color: string; bg: string }
> = {
  critical: {
    label: 'Critical',
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
  error: {
    label: 'Error',
    icon: AlertTriangle,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  info: {
    label: 'Info',
    icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
};

const SEVERITY_ORDER = ['critical', 'error', 'warning', 'info'];

export function BriefingCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="briefing-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading briefing…</span>
      </div>
    );
  }

  const data = extractData(output);
  if (!data) {
    return (
      <div
        data-slot="briefing-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Briefing unavailable
      </div>
    );
  }

  const summary = data.summary ?? {};
  const signals = data.signals ?? {};
  const total = data.totalEvents ?? 0;

  return (
    <div
      data-slot="briefing-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <FileText className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Briefing</span>
        <span className="ml-auto text-muted-foreground">
          {total} event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Severity badges */}
      {total > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border/50 px-3 py-1.5">
          {SEVERITY_ORDER.filter((s) => (summary[s] ?? 0) > 0).map((s) => {
            const cfg = SEVERITY_CONFIG[s] ?? SEVERITY_CONFIG.info;
            return (
              <span
                key={s}
                className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', cfg.bg)}
              >
                <span className={cn('font-semibold tabular-nums', cfg.color)}>{summary[s]}</span>
                <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Signal list — show up to 8 most important signals */}
      <div className="max-h-40 overflow-y-auto p-2">
        {total === 0 ? (
          <div className="px-1 py-2 text-center text-muted-foreground">
            All clear — no events since last briefing
          </div>
        ) : (
          <div className="space-y-1">
            {SEVERITY_ORDER.flatMap((severity) =>
              ((signals[severity] as BriefingSignal[]) ?? []).slice(0, 3).map((signal, i) => {
                const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
                const Icon = cfg.icon;
                return (
                  <div
                    key={signal.id ?? `${severity}-${i}`}
                    className="flex items-start gap-1.5 rounded px-1.5 py-1 hover:bg-muted/40"
                  >
                    <Icon className={cn('mt-0.5 size-3 shrink-0', cfg.color)} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-foreground/80">
                        {signal.featureName ?? signal.trigger ?? 'Event'}
                      </span>
                      {signal.error && (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {signal.error}
                        </span>
                      )}
                    </div>
                    {signal.timestamp && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(signal.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Since footer */}
      {data.since && (
        <div className="border-t border-border/50 px-3 py-1 text-[10px] text-muted-foreground">
          Since {new Date(data.since).toLocaleString()}
        </div>
      )}
    </div>
  );
}
