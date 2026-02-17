/**
 * MetricsPanel — Floating KPI cards
 *
 * Compact view of key metrics: cost, throughput, success rate.
 */

import { motion } from 'motion/react';
import { DollarSign, Zap, TrendingUp, Clock } from 'lucide-react';
import { useLedgerAggregate } from '@/hooks/queries/use-metrics';

interface MetricsPanelProps {
  projectPath?: string;
}

export function MetricsPanel({ projectPath }: MetricsPanelProps) {
  const { data } = useLedgerAggregate(projectPath);

  const metrics = [
    {
      icon: DollarSign,
      label: 'Total Cost',
      value: data?.totalCostUsd != null ? `$${data.totalCostUsd.toFixed(2)}` : '--',
      color: 'text-emerald-400',
    },
    {
      icon: Zap,
      label: 'Features',
      value: data?.totalFeatures?.toString() ?? '--',
      color: 'text-blue-400',
    },
    {
      icon: TrendingUp,
      label: 'Success',
      value: data?.successRate != null ? `${Math.round(data.successRate * 100)}%` : '--',
      color: 'text-violet-400',
    },
    {
      icon: Clock,
      label: 'Avg Cycle',
      value: data?.avgCycleTimeMs != null ? `${Math.round(data.avgCycleTimeMs / 60000)}m` : '--',
      color: 'text-amber-400',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg p-3 space-y-2"
    >
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
        Metrics
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30">
            <m.icon className={`w-3.5 h-3.5 ${m.color} shrink-0`} />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
              <p className="text-xs font-semibold tabular-nums">{m.value}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
