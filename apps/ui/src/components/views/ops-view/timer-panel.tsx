/**
 * Timer Panel
 *
 * Displays all registered timers (cron + interval) grouped by category
 * with collapsible sections. Supports pause/resume for individual timers
 * and bulk operations.
 */

import { useState, useCallback } from 'react';
import {
  Timer,
  Clock,
  Pause,
  Play,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTimerStatus } from './use-timer-status';
import type { TimerRegistryEntry, TimerCategory } from '@protolabsai/types';

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_ORDER: TimerCategory[] = ['maintenance', 'health', 'monitor', 'sync', 'system'];

const CATEGORY_LABELS: Record<TimerCategory, string> = {
  maintenance: 'Maintenance',
  health: 'Health Checks',
  monitor: 'Monitors',
  sync: 'Sync',
  system: 'System',
};

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60_000) return `in ${Math.floor(absDiff / 1000)}s`;
    if (absDiff < 3_600_000) return `in ${Math.floor(absDiff / 60_000)}m`;
    return `in ${(absDiff / 3_600_000).toFixed(1)}h`;
  }
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${(diff / 3_600_000).toFixed(1)}h ago`;
}

function formatIntervalMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms < 3_600_000) return `${ms / 60_000}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// ============================================================================
// Sub-components
// ============================================================================

interface TimerRowProps {
  timer: TimerRegistryEntry;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  isMutating: boolean;
}

function TimerRow({ timer, onPause, onResume, isMutating }: TimerRowProps) {
  const hasFailures = timer.failureCount > 0;

  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_80px_80px_100px_100px_60px_60px_40px] items-center gap-2 px-3 py-2 text-xs',
        'border-b border-border/30 last:border-b-0',
        'hover:bg-accent/30 transition-colors'
      )}
    >
      {/* Name */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate font-medium text-foreground">{timer.name}</span>
      </div>

      {/* Type */}
      <div>
        <Badge variant="muted" size="sm">
          {timer.type === 'cron' ? timer.expression : formatIntervalMs(timer.intervalMs ?? 0)}
        </Badge>
      </div>

      {/* Status */}
      <div>
        <Badge variant={timer.enabled ? 'success' : 'warning'} size="sm">
          {timer.enabled ? 'Active' : 'Paused'}
        </Badge>
      </div>

      {/* Last Run */}
      <div className="text-muted-foreground">
        {timer.lastRun ? formatRelativeTime(timer.lastRun) : '--'}
      </div>

      {/* Next Run */}
      <div className="text-muted-foreground">
        {timer.nextRun ? formatRelativeTime(timer.nextRun) : '--'}
      </div>

      {/* Failures */}
      <div
        className={cn(
          'tabular-nums',
          hasFailures ? 'text-destructive font-medium' : 'text-muted-foreground'
        )}
      >
        {hasFailures && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
        {timer.failureCount}
      </div>

      {/* Executions */}
      <div className="text-muted-foreground tabular-nums">{timer.executionCount}</div>

      {/* Action */}
      <div>
        <button
          onClick={() => (timer.enabled ? onPause(timer.id) : onResume(timer.id))}
          disabled={isMutating}
          className={cn(
            'rounded p-1 transition-colors',
            'hover:bg-accent text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:pointer-events-none'
          )}
          aria-label={timer.enabled ? `Pause ${timer.name}` : `Resume ${timer.name}`}
        >
          {timer.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  category: TimerCategory;
  timers: TimerRegistryEntry[];
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  isMutating: boolean;
}

function CategorySection({
  category,
  timers,
  onPause,
  onResume,
  isMutating,
}: CategorySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const enabledCount = timers.filter((t) => t.enabled).length;
  const failureCount = timers.reduce((sum, t) => sum + t.failureCount, 0);

  return (
    <div className="border border-border/50 rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center justify-between w-full px-3 py-2',
          'bg-accent/30 hover:bg-accent/50 transition-colors text-left'
        )}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{CATEGORY_LABELS[category]}</span>
          <Badge variant="muted" size="sm">
            {timers.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {failureCount > 0 && (
            <Badge variant="error" size="sm">
              {failureCount} failure{failureCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {enabledCount}/{timers.length} active
          </span>
        </div>
      </button>

      {expanded && (
        <div>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_80px_80px_100px_100px_60px_60px_40px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30 bg-accent/10">
            <div>Name</div>
            <div>Schedule</div>
            <div>Status</div>
            <div>Last Run</div>
            <div>Next Run</div>
            <div>Fails</div>
            <div>Runs</div>
            <div />
          </div>
          {timers.map((timer) => (
            <TimerRow
              key={timer.id}
              timer={timer}
              onPause={onPause}
              onResume={onResume}
              isMutating={isMutating}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TimerPanel() {
  const {
    timers,
    isLoading,
    isMutating,
    error,
    refetch,
    pauseTimer,
    resumeTimer,
    pauseAll,
    resumeAll,
    timersByCategory,
  } = useTimerStatus();

  const handlePause = useCallback(
    async (id: string) => {
      try {
        await pauseTimer(id);
        toast.success('Timer paused');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to pause timer');
      }
    },
    [pauseTimer]
  );

  const handleResume = useCallback(
    async (id: string) => {
      try {
        await resumeTimer(id);
        toast.success('Timer resumed');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to resume timer');
      }
    },
    [resumeTimer]
  );

  const handlePauseAll = useCallback(async () => {
    try {
      await pauseAll();
      toast.success('All timers paused');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pause all timers');
    }
  }, [pauseAll]);

  const handleResumeAll = useCallback(async () => {
    try {
      await resumeAll();
      toast.success('All timers resumed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resume all timers');
    }
  }, [resumeAll]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Timer className="h-10 w-10 text-destructive/30 mb-3" />
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={refetch}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && timers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (timers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Timer className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No timers registered</p>
      </div>
    );
  }

  const enabledCount = timers.filter((t) => t.enabled).length;
  const pausedCount = timers.length - enabledCount;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {timers.length} timer{timers.length !== 1 ? 's' : ''}
          </span>
          <Badge variant="success" size="sm">
            {enabledCount} active
          </Badge>
          {pausedCount > 0 && (
            <Badge variant="warning" size="sm">
              {pausedCount} paused
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePauseAll}
            disabled={isMutating || enabledCount === 0}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              'border border-border bg-background hover:bg-accent',
              'disabled:opacity-50 disabled:pointer-events-none'
            )}
          >
            <Pause className="h-3 w-3" />
            Pause All
          </button>
          <button
            onClick={handleResumeAll}
            disabled={isMutating || pausedCount === 0}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              'border border-border bg-background hover:bg-accent',
              'disabled:opacity-50 disabled:pointer-events-none'
            )}
          >
            <Play className="h-3 w-3" />
            Resume All
          </button>
          <button
            onClick={refetch}
            disabled={isLoading}
            className={cn(
              'rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              'disabled:opacity-50'
            )}
            aria-label="Refresh timers"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Category sections */}
      <div className="space-y-2">
        {CATEGORY_ORDER.map((category) => {
          const categoryTimers = timersByCategory.get(category);
          if (!categoryTimers || categoryTimers.length === 0) return null;
          return (
            <CategorySection
              key={category}
              category={category}
              timers={categoryTimers}
              onPause={handlePause}
              onResume={handleResume}
              isMutating={isMutating}
            />
          );
        })}
      </div>
    </div>
  );
}
