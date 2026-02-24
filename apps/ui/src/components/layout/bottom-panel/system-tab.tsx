import { useAppStore } from '@/store/app-store';
import { useSystemHealth, useEngineStatus, useCapacityMetrics } from '@/hooks/queries/use-metrics';
import { useRunningAgentsCount } from '@/hooks/queries/use-running-agents';
import { Gauge } from '@/components/dashboard';
import { Activity, Bot, Layers } from 'lucide-react';

function StatusRow({
  icon: Icon,
  label,
  value,
  statusColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  statusColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={`text-xs font-semibold tabular-nums ${statusColor ?? ''}`}>{value}</span>
    </div>
  );
}

interface HealthDashboardResponse {
  memory?: { usedPercent?: number };
  cpu?: { loadPercent?: number };
  heap?: { percentage?: number };
}

export function SystemTab() {
  const currentProject = useAppStore((s) => s.currentProject);
  const { data: health, isLoading: healthLoading } = useSystemHealth(currentProject?.path) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    isLoading: boolean;
  };
  const { data: engine, isLoading: engineLoading } = useEngineStatus() as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    isLoading: boolean;
  };
  const { data: agentCount } = useRunningAgentsCount();
  const { data: rawCapacity } = useCapacityMetrics(currentProject?.path);
  const capacity = rawCapacity as { maxConcurrency?: number } | undefined;

  if (healthLoading && engineLoading) {
    return (
      <div className="space-y-2 px-3 py-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const typedHealth = health as HealthDashboardResponse | undefined;
  const memoryPercent = typedHealth?.memory?.usedPercent ?? 0;
  const cpuPercent = typedHealth?.cpu?.loadPercent ?? 0;
  const heapPercent = typedHealth?.heap?.percentage ?? 0;

  const autoModeRunning = engine?.services?.autoMode?.running ?? false;

  const services = engine?.services ?? {};
  const activeServices = Object.values(services).filter(
    (s: unknown) =>
      s && typeof s === 'object' && 'running' in s && (s as { running: boolean }).running
  ).length;
  const totalServices = Object.keys(services).length;

  return (
    <div className="px-3 py-2 h-full overflow-y-auto">
      {/* Gauge row */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Gauge value={memoryPercent} max={100} label="RAM" size={64} />
        <Gauge value={cpuPercent} max={100} label="CPU" size={64} />
        <Gauge value={heapPercent} max={100} label="Heap" size={64} />
      </div>

      {/* Status rows */}
      <div className="divide-y divide-border/50">
        <StatusRow
          icon={Bot}
          label="Agents"
          value={`${agentCount} / ${capacity?.maxConcurrency ?? 6}`}
          statusColor={agentCount > 0 ? 'text-blue-500' : undefined}
        />
        <StatusRow
          icon={Activity}
          label="Auto-mode"
          value={autoModeRunning ? 'Running' : 'Stopped'}
          statusColor={autoModeRunning ? 'text-green-500' : 'text-muted-foreground'}
        />
        <StatusRow
          icon={Layers}
          label="Services"
          value={totalServices > 0 ? `${activeServices} / ${totalServices} active` : 'N/A'}
        />
      </div>
    </div>
  );
}
