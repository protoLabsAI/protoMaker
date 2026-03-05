import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import { useAppStore } from '@/store/app-store';
import { apiFetch } from '@/lib/api-fetch';
import { useSystemHealth, useCapacityMetrics } from '@/hooks/queries/use-metrics';
import { Gauge, CapacityBar, FlowStatus } from '@/components/dashboard/system-health';
import { GlowCard } from '@/components/dashboard/glow-card';

interface HealthMetrics {
  status: string;
  timestamp: string;
  version: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  env: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
}

interface BoardHealthIssue {
  type: string;
  featureId: string;
  featureTitle: string;
  message: string;
  autoFixable: boolean;
  fix?: string;
}

interface BoardHealthReport {
  checkedAt: string;
  totalFeatures: number;
  issues: BoardHealthIssue[];
  fixed: BoardHealthIssue[];
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

export function HealthSection() {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [boardHealth, setBoardHealth] = useState<BoardHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentProject = useAppStore((state) => state.currentProject);
  const projectPath = currentProject?.path ?? '';

  const healthQuery = useSystemHealth(projectPath);
  const capacityQuery = useCapacityMetrics(projectPath);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/health/detailed', 'GET');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBoardHealth = useCallback(
    async (autoFix = false) => {
      setBoardLoading(true);
      try {
        const projectPath = currentProject?.path;
        if (!projectPath) return;

        const res = await apiFetch('/api/features/health', 'POST', {
          body: { projectPath, autoFix },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success) {
          setBoardHealth(data.report);
        }
      } catch {
        // Board health is optional - don't block on failure
      } finally {
        setBoardLoading(false);
      }
    },
    [currentProject?.path]
  );

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const handleAutoFix = useCallback(() => {
    const confirmed = window.confirm(
      'Auto-fix will automatically resolve fixable board health issues (reset stale features, clear orphaned references, etc.). Continue?'
    );
    if (confirmed) {
      fetchBoardHealth(true);
    }
  }, [fetchBoardHealth]);

  const memoryPercent = metrics
    ? Math.round((metrics.memory.heapUsed / metrics.memory.heapTotal) * 100)
    : 0;

  const memoryStatus = memoryPercent > 90 ? 'critical' : memoryPercent > 70 ? 'warning' : 'healthy';

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
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
              <Activity className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">System Health</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchHealth();
              fetchBoardHealth();
            }}
            disabled={loading}
          >
            {loading ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
            )}
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Server metrics, memory usage, and board health status.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading && !metrics ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : metrics ? (
          <>
            {/* Server Status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Status"
                value={metrics.status === 'ok' ? 'Healthy' : metrics.status}
                icon={
                  metrics.status === 'ok' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )
                }
              />
              <MetricCard label="Uptime" value={formatUptime(metrics.uptime)} />
              <MetricCard label="Version" value={metrics.version || 'dev'} />
              <MetricCard label="Node.js" value={metrics.env?.nodeVersion || 'unknown'} />
            </div>

            {/* Memory Usage */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Memory Usage</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Heap Used / Total</span>
                  <span
                    className={cn(
                      'font-medium',
                      memoryStatus === 'critical' && 'text-red-400',
                      memoryStatus === 'warning' && 'text-yellow-400',
                      memoryStatus === 'healthy' && 'text-emerald-400'
                    )}
                  >
                    {formatBytes(metrics.memory.heapUsed)} / {formatBytes(metrics.memory.heapTotal)}{' '}
                    ({memoryPercent}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-accent/30 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      memoryStatus === 'critical' && 'bg-red-500',
                      memoryStatus === 'warning' && 'bg-yellow-500',
                      memoryStatus === 'healthy' && 'bg-emerald-500'
                    )}
                    style={{ width: `${Math.min(memoryPercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>RSS: {formatBytes(metrics.memory.rss)}</span>
                  <span>External: {formatBytes(metrics.memory.external)}</span>
                </div>
              </div>
            </div>

            {/* Board Health */}
            <div className="space-y-3 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Board Health</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchBoardHealth(false)}
                    disabled={boardLoading}
                  >
                    {boardLoading ? <Spinner size="sm" className="mr-1" /> : null}
                    Audit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoFix}
                    disabled={boardLoading}
                  >
                    <Wrench className="h-3 w-3 mr-1" />
                    Auto-Fix
                  </Button>
                </div>
              </div>

              {boardHealth ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {boardHealth.totalFeatures} features checked
                    </span>
                    {boardHealth.issues.length === 0 ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        No issues found
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {boardHealth.issues.length} issue(s)
                      </span>
                    )}
                    {boardHealth.fixed.length > 0 && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Wrench className="w-3.5 h-3.5" />
                        {boardHealth.fixed.length} auto-fixed
                      </span>
                    )}
                  </div>

                  {boardHealth.issues.length > 0 && (
                    <div className="space-y-2">
                      {boardHealth.issues.map((issue, i) => (
                        <div
                          key={`${issue.featureId}-${i}`}
                          className="p-3 rounded-lg bg-accent/20 border border-border/30 text-sm"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                              {issue.type.replace(/_/g, ' ')}
                            </span>
                            <span className="font-medium truncate">{issue.featureTitle}</span>
                          </div>
                          <p className="text-muted-foreground text-xs">{issue.message}</p>
                          {issue.autoFixable && issue.fix && (
                            <p className="text-xs text-emerald-400 mt-1">Fix: {issue.fix}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click "Audit" to check board health for the current project.
                </p>
              )}
            </div>
          </>
        ) : null}

        {/* System Metrics - Gauges, Capacity, Flow Status */}
        {projectPath && (
          <SystemMetricsPanel healthQuery={healthQuery} capacityQuery={capacityQuery} />
        )}
      </div>
    </div>
  );
}

function SystemMetricsPanel({
  healthQuery,
  capacityQuery,
}: {
  healthQuery: ReturnType<typeof useSystemHealth>;
  capacityQuery: ReturnType<typeof useCapacityMetrics>;
}) {
  const health = healthQuery.data;
  const capacity = capacityQuery.data;

  if (healthQuery.isLoading || capacityQuery.isLoading) {
    return (
      <div className="pt-4 border-t border-border/30">
        <div className="flex items-center justify-center h-32">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (healthQuery.error && capacityQuery.error) return null;

  const memoryPercent = health?.memory
    ? (health.memory.rss / (health.memory.heapTotal * 2)) * 100
    : 0;
  const heapPercent = health?.heap ? health.heap.percentage : 0;
  const agentCount = health?.agents?.count ?? 0;
  const maxAgents = 10;
  const cpuPercent = health?.cpu?.loadPercent ?? 0;

  const crewFlows: Array<{
    name: string;
    status: 'active' | 'idle' | 'error';
    lastRun?: string;
    avgLatencyMs?: number;
  }> = health?.crew?.members
    ? Object.values(health.crew.members).map((member) => ({
        name: member.displayName || member.id,
        status: (member.running ? 'active' : member.enabled ? 'idle' : 'error') as
          | 'active'
          | 'idle'
          | 'error',
        lastRun: member.lastCheck,
        avgLatencyMs: undefined,
      }))
    : [];

  if (health?.autoMode) {
    crewFlows.unshift({
      name: 'Auto Mode',
      status: health.autoMode.isRunning ? 'active' : 'idle',
      lastRun: undefined,
      avgLatencyMs: undefined,
    });
  }

  return (
    <div className="space-y-4 pt-4 border-t border-border/30">
      <h3 className="text-sm font-medium text-foreground">System Metrics</h3>

      <GlowCard orb="none" className="p-5">
        <h4 className="text-sm font-semibold mb-4">Server Health</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Gauge
            value={memoryPercent}
            max={100}
            label="Memory"
            unit="%"
            thresholds={{ warn: 70, critical: 90 }}
          />
          <Gauge
            value={cpuPercent}
            max={100}
            label="CPU"
            unit="%"
            thresholds={{ warn: 70, critical: 90 }}
          />
          <Gauge
            value={heapPercent}
            max={100}
            label="Heap"
            unit="%"
            thresholds={{ warn: 70, critical: 90 }}
          />
          <Gauge
            value={agentCount}
            max={maxAgents}
            label="Agents"
            unit=""
            thresholds={{ warn: 7, critical: 9 }}
          />
        </div>
      </GlowCard>

      <GlowCard orb="none" className="p-5">
        <h4 className="text-sm font-semibold mb-4">Capacity Utilization</h4>
        <div className="space-y-4">
          <CapacityBar
            label="Agent Slots"
            current={capacity?.currentConcurrency ?? 0}
            max={capacity?.maxConcurrency ?? 3}
            color="var(--chart-1)"
          />
          <CapacityBar
            label="Active Worktrees"
            current={capacity?.currentConcurrency ?? 0}
            max={capacity?.maxConcurrency ?? 3}
            color="var(--chart-4)"
          />
          <CapacityBar
            label="Queue Depth"
            current={capacity?.backlogSize ?? 0}
            max={Math.max(capacity?.backlogSize ?? 10, 10)}
            color="var(--chart-3)"
          />
        </div>
      </GlowCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FlowStatus flows={crewFlows} />

        <GlowCard orb="none" className="p-5">
          <h4 className="text-sm font-semibold mb-3">Auto-Mode Status</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <span
                className={`text-sm font-medium ${health?.autoMode?.isRunning ? 'text-emerald-400' : 'text-muted-foreground'}`}
              >
                {health?.autoMode?.isRunning ? 'Running' : 'Idle'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Active Features</span>
              <span className="text-sm font-medium tabular-nums">
                {health?.autoMode?.runningCount ?? 0}
              </span>
            </div>
            {health?.autoMode?.runningFeatures && health.autoMode.runningFeatures.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 block">
                  Running
                </span>
                <div className="space-y-1">
                  {health.autoMode.runningFeatures.map((featureId: string, i: number) => (
                    <div
                      key={i}
                      className="text-xs text-muted-foreground font-mono truncate"
                      title={featureId}
                    >
                      {featureId}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlowCard>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-accent/20 border border-border/30">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-foreground">{value}</span>
      </div>
    </div>
  );
}
