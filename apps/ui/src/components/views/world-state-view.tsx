/**
 * World State View - GOAP Brain Loop Dashboard
 *
 * Shows real-time world state, goals, actions, and action history
 * for the GOAP management loop. Includes role selector for manual
 * override and auto-rotate display.
 */

import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { useGOAPStatus } from '@/hooks/queries/use-goap';
import { useGOAPEvents } from '@/hooks/use-goap-events';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  Target,
  Zap,
  History,
  Shield,
  Truck,
  Wrench,
  RefreshCw,
} from 'lucide-react';

// ─── Role definitions (client-side display metadata) ────────────────────────

const ROLES = [
  { id: 'shipper', name: 'Shipper', icon: Truck, color: 'blue' },
  { id: 'janitor', name: 'Janitor', icon: Wrench, color: 'yellow' },
  { id: 'guardian', name: 'Guardian', icon: Shield, color: 'red' },
] as const;

// ─── Base goal names (for display when server hasn't returned data yet) ─────

const BASE_GOAL_NAMES: Record<string, string> = {
  keep_shipping: 'Keep Shipping',
  recover_failures: 'Recover Failures',
  maintain_health: 'Maintain Health',
  stay_productive: 'Stay Productive',
  clear_pipeline: 'Clear Pipeline',
  manage_wip: 'Manage WIP',
};

export function WorldStateView() {
  const { currentProject } = useAppStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
    }))
  );

  const projectPath = currentProject?.path;
  const { data, isLoading } = useGOAPStatus(projectPath);
  useGOAPEvents(projectPath);

  const status = data?.status ?? null;
  const isRunning = status?.isRunning ?? false;
  const isPaused = status?.isPaused ?? false;

  const handleStart = useCallback(async () => {
    if (!projectPath) return;
    try {
      const api = getElectronAPI() as any;
      await api.goap.start(projectPath);
      toast.success('GOAP brain loop started');
    } catch (error) {
      toast.error(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectPath]);

  const handleStop = useCallback(async () => {
    if (!projectPath) return;
    try {
      const api = getElectronAPI() as any;
      await api.goap.stop(projectPath);
      toast.success('GOAP brain loop stopped');
    } catch (error) {
      toast.error(`Failed to stop: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectPath]);

  const handlePause = useCallback(async () => {
    if (!projectPath) return;
    try {
      const api = getElectronAPI() as any;
      await api.goap.pause(projectPath);
      toast.success('GOAP brain loop paused');
    } catch (error) {
      toast.error(`Failed to pause: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectPath]);

  const handleResume = useCallback(async () => {
    if (!projectPath) return;
    try {
      const api = getElectronAPI() as any;
      await api.goap.resume(projectPath);
      toast.success('GOAP brain loop resumed');
    } catch (error) {
      toast.error(`Failed to resume: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [projectPath]);

  const handleSetRole = useCallback(
    async (roleId: string | null) => {
      if (!projectPath) return;
      try {
        const api = getElectronAPI() as any;
        await api.goap.setRole(projectPath, roleId);
        toast.success(roleId ? `Role set to ${roleId}` : 'Auto-rotate enabled');
      } catch (error) {
        toast.error(
          `Failed to set role: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    [projectPath]
  );

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a project to use the World State dashboard.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const worldState = status?.lastWorldState?.state;
  const capturedAt = status?.lastWorldState?.capturedAt;
  const evalMs = status?.lastWorldState?.evaluationDurationMs;
  const activeRole = status?.activeRole;
  const isAutoRotate = !status?.roleOverride;

  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">World State</h1>
        <div className="flex items-center gap-2">
          {!isRunning && (
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <Play className="h-3.5 w-3.5" />
              Start
            </button>
          )}
          {isRunning && !isPaused && (
            <button
              type="button"
              onClick={handlePause}
              className="inline-flex items-center gap-1.5 rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
          {isPaused && (
            <button
              type="button"
              onClick={handleResume}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Role Selector */}
      {isRunning && (
        <div className="mb-4 rounded-md border border-border bg-card px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Active Role</span>
            {activeRole && (
              <span className="text-xs text-muted-foreground">
                {activeRole.selectedBy === 'manual' ? 'Manual' : 'Auto'} &mdash; {activeRole.reason}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {ROLES.map((role) => {
              const Icon = role.icon;
              const isActive = activeRole?.id === role.id;
              const colorClasses = getRoleColorClasses(role.color, isActive);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSetRole(role.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${colorClasses}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {role.name}
                  {isActive && !isAutoRotate && (
                    <span className="ml-1 rounded bg-white/10 px-1 py-0.5 text-[10px] font-semibold uppercase">
                      Manual
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleSetRole(null)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                isAutoRotate
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-border text-muted-foreground hover:border-emerald-500/30 hover:text-emerald-400'
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Auto
            </button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="mb-4 flex items-center gap-4 rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          {isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped'}
        </span>
        {status && (
          <>
            <span>Tick #{status.tickCount}</span>
            {status.lastTickAt && <span>Last: {formatTimeAgo(status.lastTickAt)}</span>}
            <span>Errors: {status.consecutiveErrors}</span>
            {evalMs !== undefined && <span>Eval: {evalMs}ms</span>}
          </>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* World State */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Target className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium">World State</span>
            {capturedAt && (
              <span className="ml-auto text-xs text-muted-foreground">
                {formatTimeAgo(capturedAt)}
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {worldState ? (
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(worldState)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <tr key={key} className="border-b border-border/50 last:border-0">
                        <td className="py-1 pr-3 font-mono text-muted-foreground">{key}</td>
                        <td className="py-1">
                          <StateValue value={value} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No state yet. Start the loop to begin evaluation.
              </div>
            )}
          </div>
        </div>

        {/* Goals */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium">Goals</span>
            {activeRole && (
              <span className="ml-auto text-xs text-muted-foreground">
                {activeRole.name} priorities
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {status ? (
              <div className="space-y-1">
                {getAllGoals(status).map((goal) => (
                  <div key={goal.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                    {goal.satisfied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    )}
                    <span className={goal.satisfied ? 'text-muted-foreground' : ''}>
                      {goal.name}
                    </span>
                    <span className="ml-auto font-mono text-muted-foreground">
                      P{goal.priority}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No goals evaluated yet.
              </div>
            )}
          </div>
        </div>

        {/* Available Actions */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Zap className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium">Available Actions</span>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {status?.availableActions && status.availableActions.length > 0 ? (
              <div className="space-y-1">
                {status.availableActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-2 rounded px-2 py-1 text-xs"
                  >
                    <span>{action.name}</span>
                    <span className="ml-auto font-mono text-muted-foreground">
                      cost: {action.cost}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No actions available.
              </div>
            )}
          </div>
        </div>

        {/* Action History */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <History className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-medium">Action History</span>
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {status?.actionHistory && status.actionHistory.length > 0 ? (
              <div className="space-y-1">
                {[...status.actionHistory].reverse().map((result, i) => (
                  <div key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                    {result.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    )}
                    <span>{result.action.name}</span>
                    <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {result.durationMs}ms
                    </span>
                    <span className="text-muted-foreground">
                      {formatTimeAgo(result.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No actions executed yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error display */}
      {status?.lastError && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          Last error: {status.lastError}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StateValue({ value }: { value: boolean | number | string }) {
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-400' : 'text-red-400'}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="font-mono text-blue-400">{value}</span>;
  }
  return <span className="text-foreground">{String(value)}</span>;
}

/**
 * Build a merged list of all goals with satisfaction status.
 * Uses unsatisfied goals from the server (which now include role-weighted priorities).
 * Satisfied goals are inferred from base goal names not in the unsatisfied set.
 */
function getAllGoals(
  status: NonNullable<ReturnType<typeof useGOAPStatus>['data']>['status']
): Array<{ id: string; name: string; priority: number; satisfied: boolean }> {
  if (!status) return [];

  const unsatisfiedMap = new Map(
    status.unsatisfiedGoals.map((g) => [g.id, { name: g.name, priority: g.priority }])
  );

  // Build the full list: unsatisfied goals from server + satisfied goals (those not in unsatisfied)
  const allGoalIds = new Set([...Object.keys(BASE_GOAL_NAMES), ...unsatisfiedMap.keys()]);

  return Array.from(allGoalIds)
    .map((id) => {
      const unsatisfied = unsatisfiedMap.get(id);
      if (unsatisfied) {
        return { id, name: unsatisfied.name, priority: unsatisfied.priority, satisfied: false };
      }
      // Goal is satisfied — use a default priority of 0 for display ordering
      return { id, name: BASE_GOAL_NAMES[id] ?? id, priority: 0, satisfied: true };
    })
    .sort((a, b) => b.priority - a.priority);
}

function getRoleColorClasses(color: string, isActive: boolean): string {
  if (!isActive) {
    return 'border-border text-muted-foreground hover:border-border/80';
  }
  switch (color) {
    case 'blue':
      return 'border-blue-500/50 bg-blue-500/10 text-blue-400';
    case 'yellow':
      return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400';
    case 'red':
      return 'border-red-500/50 bg-red-500/10 text-red-400';
    default:
      return 'border-border bg-muted text-foreground';
  }
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}
