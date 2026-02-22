/**
 * SystemTab - System health and capacity metrics dashboard tab
 *
 * Displays Gauge components for server health (memory, CPU, heap, agents),
 * CapacityBar for agent slots, worktrees, and queue depth,
 * FlowStatus for crew loop and auto-mode status.
 */

import { useSystemHealth, useCapacityMetrics } from '@/hooks/queries/use-metrics';
import { Gauge, CapacityBar, FlowStatus } from '@/components/dashboard/system-health';
import { GlowCard } from '@/components/dashboard/glow-card';

interface SystemTabProps {
  projectPath: string;
}

export function SystemTab({ projectPath }: SystemTabProps) {
  const healthQuery = useSystemHealth(projectPath);
  const capacityQuery = useCapacityMetrics(projectPath);

  const health = healthQuery.data;
  const capacity = capacityQuery.data;

  // Loading state
  if (healthQuery.isLoading || capacityQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading system metrics...</div>
      </div>
    );
  }

  // Error state
  if (healthQuery.error || capacityQuery.error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Failed to load system metrics</div>
      </div>
    );
  }

  // Calculate metrics for gauges
  const memoryPercent = health?.memory
    ? (health.memory.rss / (health.memory.heapTotal * 2)) * 100
    : 0;
  const heapPercent = health?.heap ? health.heap.percentage : 0;
  const agentCount = health?.agents?.count ?? 0;
  const maxAgents = 10; // Default max concurrent agents

  // CPU load percentage (server pre-computes this from load average / core count)
  const cpuPercent = health?.cpu?.loadPercent ?? 0;

  // Crew loop flows - map crew status to flow format
  // crew.members is a Record<string, MemberStatus>, not an array
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

  // Add auto-mode status as a flow
  if (health?.autoMode) {
    crewFlows.unshift({
      name: 'Auto Mode',
      status: health.autoMode.isRunning ? 'active' : 'idle',
      lastRun: undefined,
      avgLatencyMs: undefined,
    });
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Health Gauges */}
      <GlowCard orb="none" className="p-5">
        <h3 className="text-sm font-semibold mb-4">Server Health</h3>
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

      {/* Row 2: Capacity Bars */}
      <GlowCard orb="none" className="p-5">
        <h3 className="text-sm font-semibold mb-4">Capacity Utilization</h3>
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

      {/* Row 3: Flow Status + Auto-Mode Throughput */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FlowStatus flows={crewFlows} />

        <GlowCard orb="none" className="p-5">
          <h3 className="text-sm font-semibold mb-3">Auto-Mode Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <span
                className={`text-sm font-medium ${
                  health?.autoMode?.isRunning ? 'text-emerald-400' : 'text-muted-foreground'
                }`}
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
