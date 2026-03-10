import { useEffect, useState } from 'react';
import { Spinner } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react';
import type { AutomationRunRecord, AutomationRunStatus } from '@protolabsai/types';
import { getAutomationHistory } from '@/lib/api';
import { getLangfuseTraceUrl } from '@/lib/langfuse-url';
import { formatDuration, formatTimestamp } from '@protolabsai/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RunStatusBadge({ status }: { status: AutomationRunStatus }) {
  const configs: Record<
    AutomationRunStatus,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    success: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: 'Success',
      cls: 'text-green-500',
    },
    failure: {
      icon: <XCircle className="w-3 h-3" />,
      label: 'Failed',
      cls: 'text-destructive',
    },
    running: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: 'Running',
      cls: 'text-blue-500',
    },
    cancelled: {
      icon: <XCircle className="w-3 h-3" />,
      label: 'Cancelled',
      cls: 'text-muted-foreground',
    },
  };
  const cfg = configs[status];
  return (
    <span className={cn('flex items-center gap-1 text-xs', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AutomationHistoryPanelProps {
  automationId: string;
  /** Number of columns in the parent table so the cell spans correctly */
  colSpan: number;
}

export function AutomationHistoryPanel({ automationId, colSpan }: AutomationHistoryPanelProps) {
  const [runs, setRuns] = useState<AutomationRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAutomationHistory(automationId);
        if (!cancelled) setRuns(data.slice(0, 10));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [automationId]);

  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pb-3 pt-0 bg-muted/10">
        <div className="rounded-md border border-border/40 bg-background/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
            <span className="text-xs font-medium text-muted-foreground">Run History</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="w-4 h-4 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-xs text-destructive">{error}</div>
          ) : runs.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">No runs recorded yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">
                    Started
                  </th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">
                    Duration
                  </th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">
                    Status
                  </th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Error</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium w-16">
                    Trace
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(run.startedAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                      {run.completedAt
                        ? formatDuration(
                            new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                          )
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[280px]">
                      {run.error ? (
                        <span className="text-destructive truncate block" title={run.error}>
                          {run.error}
                        </span>
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {run.traceId ? (
                        <a
                          href={getLangfuseTraceUrl(run.traceId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-brand-500 hover:text-brand-400 transition-colors"
                          title="View trace in Langfuse"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Trace
                        </a>
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}
