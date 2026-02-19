import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { CostChart } from '@/components/views/dashboard-view/metrics/cost-chart';
import { ThroughputChart } from '@/components/views/dashboard-view/metrics/throughput-chart';
import { ModelPieChart } from '@/components/views/dashboard-view/metrics/model-pie';
import { SuccessChart } from '@/components/views/dashboard-view/metrics/success-chart';
import { useTimeSeries, useModelDistribution } from '@/hooks/queries/use-metrics';

const TABS = [
  { id: 'cost', label: 'Cost' },
  { id: 'throughput', label: 'Throughput' },
  { id: 'model', label: 'Models' },
  { id: 'success', label: 'Success' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ChartsTab() {
  const [activeTab, setActiveTab] = useState<TabId>('cost');
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;

  const costQuery = useTimeSeries(projectPath, 'cost', 'day');
  const throughputQuery = useTimeSeries(projectPath, 'throughput', 'day');
  const successQuery = useTimeSeries(projectPath, 'success_rate', 'day');
  const modelQuery = useModelDistribution(projectPath);

  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Select a project to view charts
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab bar */}
      <div className="flex border-b border-border/30 px-2 pt-1 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1 text-[11px] font-medium rounded-t-md transition-colors',
              activeTab === tab.id
                ? 'text-foreground bg-muted/50 border-b-2 border-violet-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart content */}
      <div className="flex-1 p-3 min-h-0">
        <div className="h-[200px]">
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
      </div>
    </div>
  );
}
