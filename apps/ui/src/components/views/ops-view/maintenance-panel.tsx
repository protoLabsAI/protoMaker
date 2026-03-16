/**
 * Maintenance Panel
 *
 * Shows server environment information, version, sync status, and
 * uptime derived from the detailed health endpoint.
 */

import {
  Server,
  Clock,
  Database,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useMaintenanceStatus } from './use-maintenance-status';

// ============================================================================
// Helpers
// ============================================================================

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

// ============================================================================
// Sub-components
// ============================================================================

interface InfoRowProps {
  label: string;
  value: string | number;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

interface InfoCardProps {
  title: string;
  icon: typeof Server;
  children: React.ReactNode;
}

function InfoCard({ title, icon: Icon, children }: InfoCardProps) {
  return (
    <div className="border border-border/50 rounded-md">
      <div className="flex items-center gap-2 px-3 py-2 bg-accent/30 border-b border-border/30">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="px-3 py-2 divide-y divide-border/20">{children}</div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MaintenancePanel() {
  const { health, isLoading, error, refetch } = useMaintenanceStatus();

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Server className="h-10 w-10 text-destructive/30 mb-3" />
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
        <Server className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No health data available</p>
      </div>
    );
  }

  const statusIcon =
    health.status === 'ok' ? (
      <CheckCircle className="h-4 w-4 text-emerald-500" />
    ) : health.status === 'degraded' ? (
      <AlertTriangle className="h-4 w-4 text-amber-500" />
    ) : (
      <XCircle className="h-4 w-4 text-destructive" />
    );

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium capitalize">{health.status}</span>
          <Badge variant="muted" size="sm">
            v{health.version}
          </Badge>
        </div>
        <button
          onClick={refetch}
          disabled={isLoading}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'disabled:opacity-50'
          )}
          aria-label="Refresh health data"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Server Info */}
        <InfoCard title="Server" icon={Server}>
          <InfoRow label="Uptime" value={formatUptime(health.uptime)} />
          <InfoRow label="Version" value={health.version} mono />
          <InfoRow label="Data Directory" value={health.dataDir} mono />
          <InfoRow label="Auth Mode" value={health.auth.mode} />
        </InfoCard>

        {/* Environment */}
        <InfoCard title="Environment" icon={Database}>
          <InfoRow label="Node.js" value={health.env.nodeVersion} mono />
          <InfoRow label="Platform" value={health.env.platform} />
          <InfoRow label="Architecture" value={health.env.arch} />
        </InfoCard>

        {/* Memory */}
        <InfoCard title="Memory" icon={Clock}>
          <InfoRow label="RSS" value={formatBytes(health.memory.rss)} />
          <InfoRow label="Heap Used" value={formatBytes(health.memory.heapUsed)} />
          <InfoRow label="Heap Total" value={formatBytes(health.memory.heapTotal)} />
          <InfoRow label="External" value={formatBytes(health.memory.external)} />
        </InfoCard>

        {/* Sync Status */}
        {health.sync && (
          <InfoCard title="Sync" icon={RefreshCw}>
            {Object.entries(health.sync).map(([key, value]) => (
              <InfoRow key={key} label={key} value={String(value)} />
            ))}
          </InfoCard>
        )}
      </div>

      {/* Last checked timestamp */}
      <div className="text-[10px] text-muted-foreground text-right">
        Last checked: {new Date(health.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
