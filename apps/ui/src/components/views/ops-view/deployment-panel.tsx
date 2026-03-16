/**
 * Deployment Panel
 *
 * Displays real CI/CD deployment history and statistics.
 * Shows summary cards (total, success rate, avg duration, frequency)
 * and a chronological deployment history table with environment badges,
 * commit info, version, status, duration, and GitHub Actions links.
 */

import { useState } from 'react';
import { Rocket, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Clock } from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useDeployments } from '@/hooks/queries/use-metrics';
import type { DeployEnvironment, DeploymentEvent } from '@protolabsai/types';

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'succeeded':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'rolled_back':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case 'started':
      return <Clock className="h-3.5 w-3.5 text-blue-400 animate-pulse" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'Success';
    case 'failed':
      return 'Failed';
    case 'rolled_back':
      return 'Rolled Back';
    case 'started':
      return 'In Progress';
    default:
      return status;
  }
}

function getStatusVariant(status: string): 'default' | 'destructive' | 'outline' | 'secondary' {
  switch (status) {
    case 'succeeded':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'rolled_back':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getEnvVariant(env: string): 'default' | 'secondary' | 'outline' {
  return env === 'production' ? 'default' : 'secondary';
}

// ============================================================================
// Filter Bar
// ============================================================================

type EnvFilter = 'all' | DeployEnvironment;

const ENV_FILTERS: { id: EnvFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'staging', label: 'Staging' },
  { id: 'production', label: 'Production' },
];

// ============================================================================
// Summary Cards
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ============================================================================
// Deployment Row
// ============================================================================

function DeploymentRow({ deployment }: { deployment: DeploymentEvent }) {
  return (
    <tr className="border-b border-border/30 hover:bg-accent/30 transition-colors">
      <td className="py-2 px-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTimestamp(deployment.startedAt)}
        </span>
      </td>
      <td className="py-2 px-3">
        <Badge variant={getEnvVariant(deployment.environment)} className="text-[10px] px-1.5">
          {deployment.environment}
        </Badge>
      </td>
      <td className="py-2 px-3">
        <code className="text-xs font-mono">{deployment.commitShort}</code>
      </td>
      <td className="py-2 px-3">
        <span className="text-xs tabular-nums">{deployment.version ?? '-'}</span>
      </td>
      <td className="py-2 px-3">
        <span className="inline-flex items-center gap-1">
          {getStatusIcon(deployment.status)}
          <Badge variant={getStatusVariant(deployment.status)} className="text-[10px] px-1.5">
            {getStatusLabel(deployment.status)}
          </Badge>
        </span>
      </td>
      <td className="py-2 px-3 text-right">
        <span className="text-xs tabular-nums text-muted-foreground">
          {deployment.durationMs ? formatDuration(deployment.durationMs) : '-'}
        </span>
      </td>
      <td className="py-2 px-3 text-right">
        {deployment.runUrl && (
          <a
            href={deployment.runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-400 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DeploymentPanel() {
  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');
  const environment = envFilter === 'all' ? undefined : envFilter;
  const { data, isLoading, error } = useDeployments(environment);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading deployments...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-destructive text-sm">
        Failed to load deployments: {error.message}
      </div>
    );
  }

  const deployments = data?.deployments ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total (30d)" value={stats.total} />
          <StatCard
            label="Success Rate"
            value={`${(stats.successRate * 100).toFixed(0)}%`}
            sub={`${stats.succeeded} ok / ${stats.failed + stats.rolledBack} fail`}
          />
          <StatCard
            label="Avg Duration"
            value={stats.avgDurationMs > 0 ? formatDuration(stats.avgDurationMs) : '-'}
          />
          <StatCard label="Frequency" value={`${stats.frequencyPerDay.toFixed(1)}/day`} />
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-1">
        {ENV_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setEnvFilter(f.id)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
              envFilter === f.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Deployment Table */}
      {deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Rocket className="h-8 w-8 opacity-50" />
          <p className="text-sm">No deployments recorded yet</p>
          <p className="text-xs">Deploy events will appear here after the next CI deploy</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                  Time
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                  Env
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                  Commit
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                  Version
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                  Duration
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                  CI
                </th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <DeploymentRow key={d.id} deployment={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
