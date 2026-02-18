/**
 * ChartsPanel — Floating tabbed charts (cost, throughput, model, success)
 *
 * Fetches data via hooks and passes to existing chart components.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { CostChart } from '@/components/views/dashboard-view/metrics/cost-chart';
import { ThroughputChart } from '@/components/views/dashboard-view/metrics/throughput-chart';
import { ModelPieChart } from '@/components/views/dashboard-view/metrics/model-pie';
import { SuccessChart } from '@/components/views/dashboard-view/metrics/success-chart';
import { useTimeSeries, useModelDistribution } from '@/hooks/queries/use-metrics';

interface ChartsPanelProps {
  projectPath?: string;
}

const TABS = [
  { id: 'cost', label: 'Cost' },
  { id: 'throughput', label: 'Throughput' },
  { id: 'model', label: 'Models' },
  { id: 'success', label: 'Success' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ChartsPanel({ projectPath }: ChartsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('cost');

  const costQuery = useTimeSeries(projectPath, 'cost', 'day');
  const throughputQuery = useTimeSeries(projectPath, 'throughput', 'day');
  const successQuery = useTimeSeries(projectPath, 'success_rate', 'day');
  const modelQuery = useModelDistribution(projectPath);

  if (!projectPath) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-xl border border-border/50 bg-card/90 backdrop-blur-md shadow-lg overflow-hidden"
    >
      {/* Tab bar */}
      <div className="flex border-b border-border/30 px-2 pt-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium rounded-t-md transition-colors relative',
              activeTab === tab.id
                ? 'text-foreground bg-muted/50'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="charts-panel-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* Chart content */}
      <div className="p-3 h-[232px]">
        {activeTab === 'cost' && (
          <CostChart data={costQuery.data} isLoading={costQuery.isLoading} />
        )}
        {activeTab === 'throughput' && (
          <ThroughputChart
            title="Features/Day"
            data={throughputQuery.data}
            isLoading={throughputQuery.isLoading}
          />
        )}
        {activeTab === 'model' && (
          <ModelPieChart data={modelQuery.data} isLoading={modelQuery.isLoading} />
        )}
        {activeTab === 'success' && (
          <SuccessChart data={successQuery.data} isLoading={successQuery.isLoading} />
        )}
      </div>
    </motion.div>
  );
}
