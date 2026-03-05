import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@protolabsai/ui/atoms';
import { useSchedulerStatus, type SchedulerTask } from '@/hooks/use-scheduler-status';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeFromNow(isoString: string): string {
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (diffMs <= 0) return 'overdue';
  const diffSec = Math.floor(diffMs / 1000);
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${String(s).padStart(2, '0')}s`;
  return `in ${s}s`;
}

function useCountdown(nextRun: string | null): string {
  const [display, setDisplay] = useState(() => (nextRun ? timeFromNow(nextRun) : 'N/A'));

  useEffect(() => {
    if (!nextRun) {
      setDisplay('N/A');
      return;
    }
    setDisplay(timeFromNow(nextRun));
    const interval = setInterval(() => {
      setDisplay(timeFromNow(nextRun));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRun]);

  return display;
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TaskCard({ task }: { task: SchedulerTask }) {
  const countdown = useCountdown(task.nextRun);

  const neverRun = task.lastRun === null;
  const failed = !neverRun && task.lastError !== null;
  const succeeded = !neverRun && task.lastError === null;

  return (
    <div
      className={cn(
        'rounded-md border border-border/50 bg-card/60 p-3 flex flex-col gap-2 text-sm',
        !task.enabled && 'opacity-60'
      )}
    >
      {/* Task name + enabled badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate text-foreground" title={task.name}>
          {task.name}
        </span>
        <span
          className={cn(
            'shrink-0 text-xs px-1.5 py-0.5 rounded font-medium',
            task.enabled
              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
              : 'bg-muted/60 text-muted-foreground border border-border/50'
          )}
        >
          {task.enabled ? 'enabled' : 'disabled'}
        </span>
      </div>

      {/* Next run */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        <span>{task.enabled ? countdown : 'N/A'}</span>
      </div>

      {/* Last run result */}
      <div className="flex items-center gap-1.5 text-xs">
        {neverRun ? (
          <span className="text-muted-foreground/60">N/A</span>
        ) : failed ? (
          <span
            className="flex items-center gap-1 text-destructive"
            title={task.lastError ?? undefined}
          >
            <XCircle className="w-3 h-3 shrink-0" />
            Failed
            {task.lastError && (
              <span
                className="text-muted-foreground/60 truncate max-w-[120px]"
                title={task.lastError}
              >
                — {task.lastError}
              </span>
            )}
          </span>
        ) : succeeded ? (
          <span className="flex items-center gap-1 text-green-500">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            Success
          </span>
        ) : null}
      </div>

      {/* Execution count */}
      <div className="text-xs text-muted-foreground/70">
        {task.executionCount} run{task.executionCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SchedulerHealthGrid() {
  const { tasks, loading, error } = useSchedulerStatus();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30 mb-4">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">System Tasks</span>
          {!loading && !error && (
            <span className="text-xs text-muted-foreground/60">{tasks.length} tasks</span>
          )}
        </div>
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-4 pb-4 pt-1">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="w-5 h-5 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-4 text-xs text-destructive">{error}</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              No scheduler tasks found
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
