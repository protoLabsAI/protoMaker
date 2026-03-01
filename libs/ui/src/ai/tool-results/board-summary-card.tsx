/**
 * BoardSummaryCard — Mini-dashboard for get_board_summary tool results.
 *
 * Renders a compact status overview with count badges and a simple bar chart
 * showing the distribution of features across workflow statuses.
 */

import { Loader2, LayoutDashboard } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface StatusCounts {
  backlog?: number;
  in_progress?: number;
  review?: number;
  blocked?: number;
  done?: number;
  [key: string]: number | undefined;
}

interface BoardSummaryData {
  total?: number;
  byStatus?: StatusCounts;
  counts?: StatusCounts;
  projectPath?: string;
}

/** Normalize tool output — supports both raw data and ToolResult wrapper */
function extractData(output: unknown): BoardSummaryData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: { ... } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as BoardSummaryData;
  }
  return o as BoardSummaryData;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; barColor: string }
> = {
  backlog: {
    label: 'Backlog',
    color: 'text-muted-foreground',
    bg: 'bg-muted/60',
    barColor: 'bg-muted-foreground/40',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    barColor: 'bg-blue-500',
  },
  review: {
    label: 'Review',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    barColor: 'bg-amber-500',
  },
  blocked: {
    label: 'Blocked',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    barColor: 'bg-red-500',
  },
  done: {
    label: 'Done',
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    barColor: 'bg-green-500',
  },
};

const STATUS_ORDER = ['backlog', 'in_progress', 'review', 'blocked', 'done'];

export function BoardSummaryCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="board-summary-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading board summary…</span>
      </div>
    );
  }

  const data = extractData(output);
  const statusCounts = data?.byStatus ?? data?.counts ?? {};
  const total =
    data?.total ?? Object.values(statusCounts).reduce<number>((s, v) => s + (v ?? 0), 0);

  const entries = STATUS_ORDER.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => ({
    status: s,
    count: statusCounts[s] ?? 0,
    config: STATUS_CONFIG[s] ?? {
      label: s,
      color: 'text-foreground',
      bg: 'bg-muted/60',
      barColor: 'bg-foreground/30',
    },
  }));

  // If we have no structured data, fall back gracefully
  if (entries.length === 0 && total === 0) {
    return (
      <div
        data-slot="board-summary-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <div className="flex items-center gap-1.5">
          <LayoutDashboard className="size-3.5" />
          <span>Board summary — no features found</span>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...entries.map((e) => e.count), 1);

  return (
    <div
      data-slot="board-summary-card"
      className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs"
    >
      {/* Header */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <LayoutDashboard className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Board Summary</span>
        <span className="ml-auto text-muted-foreground">{total} total</span>
      </div>

      {/* Status badges row */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {entries.map(({ status, count, config }) => (
          <span
            key={status}
            className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', config.bg)}
          >
            <span className={cn('font-semibold tabular-nums', config.color)}>{count}</span>
            <span className="text-[10px] text-muted-foreground">{config.label}</span>
          </span>
        ))}
      </div>

      {/* Simple bar chart */}
      <div className="space-y-1">
        {entries.map(({ status, count, config }) => (
          <div key={status} className="flex items-center gap-2">
            <span className="w-[72px] shrink-0 text-[10px] text-muted-foreground">
              {config.label}
            </span>
            <div className="relative flex h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
              <div
                className={cn('h-full rounded-full transition-all', config.barColor)}
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <span className={cn('w-5 text-right tabular-nums', config.color)}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
