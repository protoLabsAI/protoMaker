import { useCallback, useEffect, useState } from 'react';
import { Timer, RefreshCw, Play, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { apiFetch } from '@/lib/api-fetch';

interface SchedulerTask {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  failureCount: number;
  executionCount: number;
}

interface SchedulerStatus {
  running: boolean;
  taskCount: number;
  enabledTaskCount: number;
  tasks: SchedulerTask[];
}

/**
 * Convert a cron expression to a human-readable description
 */
function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dom, , dow] = parts;

  // Every N minutes
  if (minute.startsWith('*/') && hour === '*' && dom === '*' && dow === '*') {
    return `Every ${minute.slice(2)} min`;
  }

  // Every N hours
  if (minute === '0' && hour.startsWith('*/') && dom === '*' && dow === '*') {
    return `Every ${hour.slice(2)} hours`;
  }

  // Hourly
  if (minute === '0' && hour === '*' && dom === '*' && dow === '*') {
    return 'Hourly';
  }

  // Daily at specific time
  if (dom === '*' && dow === '*' && !hour.includes('*') && !minute.includes('*')) {
    return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // Weekly (specific day of week)
  if (dom === '*' && dow !== '*' && !hour.includes('*') && !minute.includes('*')) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[parseInt(dow)] ?? dow;
    return `${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  return cron;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);

  if (absDiff < 60_000) return diffMs < 0 ? 'Just now' : 'In < 1m';
  if (absDiff < 3600_000) {
    const mins = Math.round(absDiff / 60_000);
    return diffMs < 0 ? `${mins}m ago` : `In ${mins}m`;
  }
  if (absDiff < 86400_000) {
    const hours = Math.round(absDiff / 3600_000);
    return diffMs < 0 ? `${hours}h ago` : `In ${hours}h`;
  }
  const days = Math.round(absDiff / 86400_000);
  return diffMs < 0 ? `${days}d ago` : `In ${days}d`;
}

export function MaintenanceSection() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCron, setEditingCron] = useState<Record<string, string>>({});
  const [triggeringTask, setTriggeringTask] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/scheduler/status', 'GET');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scheduler status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggleTask = useCallback(
    async (taskId: string, enabled: boolean) => {
      try {
        const endpoint = enabled ? 'enable' : 'disable';
        const res = await apiFetch(`/api/scheduler/tasks/${taskId}/${endpoint}`, 'POST');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle task');
      }
    },
    [fetchStatus]
  );

  const handleUpdateCron = useCallback(
    async (taskId: string) => {
      const cronExpression = editingCron[taskId];
      if (!cronExpression) return;

      try {
        const res = await apiFetch(`/api/scheduler/tasks/${taskId}/schedule`, 'POST', {
          body: { cronExpression },
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setEditingCron((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update schedule');
      }
    },
    [editingCron, fetchStatus]
  );

  const handleTriggerTask = useCallback(
    async (taskId: string) => {
      setTriggeringTask(taskId);
      try {
        const res = await apiFetch(`/api/scheduler/tasks/${taskId}/trigger`, 'POST');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to trigger task');
      } finally {
        setTriggeringTask(null);
      }
    },
    [fetchStatus]
  );

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20">
              <Timer className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Maintenance Scheduler
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
            {loading ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
            )}
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Control scheduled maintenance tasks — toggle, adjust frequency, or trigger manually.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
            <button
              className="ml-2 text-xs underline hover:no-underline"
              onClick={() => setError(null)}
            >
              dismiss
            </button>
          </div>
        )}

        {loading && !status ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : status ? (
          <>
            {/* Summary */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                {status.enabledTaskCount}/{status.taskCount} tasks enabled
              </span>
              <span className="flex items-center gap-1">
                {status.running ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    Scheduler running
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                    Scheduler stopped
                  </>
                )}
              </span>
            </div>

            {/* Task Table */}
            <div className="space-y-2">
              {status.tasks.map((task) => {
                const isEditing = task.id in editingCron;
                const currentCron = editingCron[task.id] ?? task.cronExpression;
                const isTriggering = triggeringTask === task.id;

                return (
                  <div
                    key={task.id}
                    className={cn(
                      'p-3 rounded-lg border border-border/30',
                      task.enabled ? 'bg-accent/20' : 'bg-accent/5 opacity-60'
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: toggle + name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <Switch
                          checked={task.enabled}
                          onCheckedChange={(checked) => handleToggleTask(task.id, checked)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {task.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{task.id}</p>
                        </div>
                      </div>

                      {/* Right: run now */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTriggerTask(task.id)}
                        disabled={isTriggering}
                        title="Run now"
                      >
                        {isTriggering ? <Spinner size="sm" /> : <Play className="h-3 w-3" />}
                      </Button>
                    </div>

                    {/* Schedule row */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={currentCron}
                          onChange={(e) =>
                            setEditingCron((prev) => ({ ...prev, [task.id]: e.target.value }))
                          }
                          className="h-7 w-40 text-xs font-mono"
                          placeholder="*/5 * * * *"
                        />
                        {isEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleUpdateCron(task.id)}
                          >
                            Save
                          </Button>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {cronToHuman(currentCron)}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>Last: {formatRelativeTime(task.lastRun)}</span>
                      <span>Next: {formatRelativeTime(task.nextRun)}</span>
                      <span>Runs: {task.executionCount}</span>
                      {task.failureCount > 0 && (
                        <span className="text-red-400">Failures: {task.failureCount}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
