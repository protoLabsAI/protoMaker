/**
 * HealthPanel — Floating system health gauges
 *
 * Shows memory, CPU, heap, and agent capacity.
 */

import { motion } from 'motion/react';
import { Gauge } from '@/components/dashboard';
import { useSystemHealth, useCapacityMetrics } from '@/hooks/queries/use-metrics';
import { useRunningAgentsCount } from '@/hooks/queries/use-running-agents';

interface HealthDashboardResponse {
  memory?: { usedPercent?: number };
  cpu?: { loadPercent?: number };
  heap?: { percentage?: number };
  agents?: { count?: number };
}

interface HealthPanelProps {
  projectPath?: string;
}

export function HealthPanel({ projectPath }: HealthPanelProps) {
  const { data: rawHealth } = useSystemHealth(projectPath);
  const { data: rawCapacity } = useCapacityMetrics(projectPath);
  const { data: agentCount } = useRunningAgentsCount();

  const health = rawHealth as HealthDashboardResponse | undefined;
  const capacity = rawCapacity as { maxConcurrency?: number } | undefined;

  const memoryPercent = health?.memory?.usedPercent ?? 0;
  const cpuPercent = health?.cpu?.loadPercent ?? 0;
  const heapPercent = health?.heap?.percentage ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg p-3 space-y-3"
    >
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
        System Health
      </h3>

      <div className="grid grid-cols-3 gap-2">
        <Gauge value={memoryPercent} max={100} label="RAM" size={70} />
        <Gauge value={cpuPercent} max={100} label="CPU" size={70} />
        <Gauge value={heapPercent} max={100} label="Heap" size={70} />
      </div>

      <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-border/30">
        <span className="text-muted-foreground">Agents</span>
        <span className="font-semibold tabular-nums">
          {agentCount}/{capacity?.maxConcurrency ?? 6}
        </span>
      </div>
    </motion.div>
  );
}
