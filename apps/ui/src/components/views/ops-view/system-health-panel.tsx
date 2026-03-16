/**
 * System Health Panel
 *
 * Real-time system health monitoring: memory, CPU, heap usage with progress
 * bars, active agent count, auto-mode status, and uptime. Includes a
 * composite health indicator dot.
 */

import { Activity, Cpu, HardDrive, Users, Zap, Clock, RefreshCw } from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useSystemHealth, type HealthLevel } from './use-system-health';

// ============================================================================
// Constants
// ============================================================================

const HEALTH_DOT_COLORS: Record<HealthLevel, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const HEALTH_LABELS: Record<HealthLevel, string> = {
  healthy: 'All Systems Healthy',
  warning: 'Elevated Resource Usage',
  critical: 'Critical Resource Usage',
};

const HEALTH_BADGE_VARIANTS: Record<HealthLevel, 'success' | 'warning' | 'error'> = {
  healthy: 'success',
  warning: 'warning',
  critical: 'error',
};

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}

function getProgressBarColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// ============================================================================
// Sub-components
// ============================================================================

interface MetricCardProps {
  icon: typeof Activity;
  label: string;
  children: React.ReactNode;
}

function MetricCard({ icon: Icon, label, children }: MetricCardProps) {
  return (
    <div className="border border-border/50 rounded-md p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

interface ProgressMetricProps {
  label: string;
  used: string;
  total: string;
  percentage: number;
}

function ProgressMetric({ label, used, total, percentage }: ProgressMetricProps) {
  const clampedPercent = Math.min(100, Math.max(0, percentage));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">
          {used} / {total}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            getProgressBarColor(clampedPercent)
          )}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <div className="text-right">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {clampedPercent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SystemHealthPanel() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const { health, isLoading, error, refetch, overallStatus } = useSystemHealth(projectPath);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Activity className="h-10 w-10 text-destructive/30 mb-3" />
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

  if (isLoading && !health) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No health data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HealthDot level={overallStatus} />
          <span className="text-sm font-medium">{HEALTH_LABELS[overallStatus]}</span>
          <Badge variant={HEALTH_BADGE_VARIANTS[overallStatus]} size="sm">
            {overallStatus}
          </Badge>
        </div>
        <button
          onClick={refetch}
          disabled={isLoading}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'disabled:opacity-50'
          )}
          aria-label="Refresh system health"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Heap Memory */}
        <MetricCard icon={HardDrive} label="Heap Memory">
          <ProgressMetric
            label="Heap"
            used={formatBytes(health.heap.used)}
            total={formatBytes(health.heap.total)}
            percentage={health.heap.percentage}
          />
        </MetricCard>

        {/* System Memory */}
        <MetricCard icon={HardDrive} label="System Memory">
          <ProgressMetric
            label="Memory"
            used={formatBytes(health.memory.systemUsed)}
            total={formatBytes(health.memory.systemTotal)}
            percentage={health.memory.usedPercent}
          />
        </MetricCard>

        {/* CPU */}
        <MetricCard icon={Cpu} label="CPU">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Load Average (1m)</span>
              <span className="text-xs font-medium tabular-nums">
                {health.cpu.loadAvg1m.toFixed(2)}
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  getProgressBarColor(health.cpu.loadPercent)
                )}
                style={{ width: `${Math.min(100, health.cpu.loadPercent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {health.cpu.cores} core{health.cpu.cores !== 1 ? 's' : ''}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {health.cpu.loadPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </MetricCard>

        {/* Agents + Auto-mode */}
        <MetricCard icon={Users} label="Agents">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Active Agents</span>
              <span className="text-lg font-semibold tabular-nums">{health.agents.count}</span>
            </div>
            {health.agents.active.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {health.agents.active.map((agent) => (
                  <Badge key={agent} variant="muted" size="sm">
                    {agent}
                  </Badge>
                ))}
              </div>
            )}
            <div className="pt-1 border-t border-border/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Auto-mode</span>
                </div>
                <Badge variant={health.autoMode.isRunning ? 'success' : 'muted'} size="sm">
                  {health.autoMode.isRunning ? 'Running' : 'Stopped'}
                </Badge>
              </div>
              {health.autoMode.isRunning && health.autoMode.runningCount > 0 && (
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {health.autoMode.runningCount} feature
                  {health.autoMode.runningCount !== 1 ? 's' : ''} in progress
                </span>
              )}
            </div>
          </div>
        </MetricCard>
      </div>

      {/* Uptime footer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Server uptime: {formatUptime(health.uptime)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Exported Health Dot (used by sidebar integration)
// ============================================================================

interface HealthDotProps {
  level: HealthLevel;
  className?: string;
}

export function HealthDot({ level, className }: HealthDotProps) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        HEALTH_DOT_COLORS[level],
        level === 'critical' && 'animate-pulse',
        className
      )}
      aria-label={`System health: ${level}`}
    />
  );
}
