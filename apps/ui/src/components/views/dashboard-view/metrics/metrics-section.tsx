/**
 * MetricsSection - Tabbed dashboard with charts and KPIs
 *
 * Contains Project Metrics tab and All Projects tab.
 * Uses persistent ledger data that survives feature archival.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useLedgerAggregate,
  useTimeSeries,
  useModelDistribution,
  useCycleTimeDistribution,
} from '@/hooks/queries/use-metrics';
import { TimeRangeSelector, useTimeRangeDates, type TimeRange } from './time-range';
import { KpiCards } from './kpi-cards';
import { CostChart } from './cost-chart';
import { ThroughputChart } from './throughput-chart';
import { ModelPieChart } from './model-pie';
import { CycleTimeChart } from './cycle-time-chart';
import { SuccessChart } from './success-chart';

interface MetricsSectionProps {
  projectPath: string;
}

function ProjectMetricsTab({ projectPath }: { projectPath: string }) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const { startDate, endDate } = useTimeRangeDates(timeRange);

  const aggregate = useLedgerAggregate(projectPath, startDate, endDate);
  const costSeries = useTimeSeries(projectPath, 'cost', 'day', startDate, endDate);
  const throughputSeries = useTimeSeries(projectPath, 'throughput', 'day', startDate, endDate);
  const prSeries = useTimeSeries(projectPath, 'pr_throughput', 'day', startDate, endDate);
  const commitSeries = useTimeSeries(projectPath, 'commit_throughput', 'day', startDate, endDate);
  const successSeries = useTimeSeries(projectPath, 'success_rate', 'day', startDate, endDate);
  const modelDist = useModelDistribution(projectPath, startDate, endDate);
  const cycleTimeDist = useCycleTimeDistribution(projectPath, startDate, endDate);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* KPI Cards */}
      <KpiCards
        data={
          aggregate.data
            ? {
                totalCostUsd: aggregate.data.totalCostUsd,
                totalFeatures: aggregate.data.totalFeatures,
                successRate: aggregate.data.successRate,
                throughputPerDay: aggregate.data.throughputPerDay,
                avgCycleTimeMs: aggregate.data.avgCycleTimeMs,
                prsPerDay: aggregate.data.prsPerDay,
                commitsPerDay: aggregate.data.commitsPerDay,
              }
            : undefined
        }
        isLoading={aggregate.isLoading}
      />

      {/* Row 2: Cost + Feature Throughput */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CostChart data={costSeries.data} isLoading={costSeries.isLoading} />
        <ThroughputChart
          title="Feature Throughput"
          data={throughputSeries.data}
          isLoading={throughputSeries.isLoading}
        />
      </div>

      {/* Row 3: PR Throughput + Commit Throughput */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ThroughputChart
          title="PRs Merged"
          data={prSeries.data}
          isLoading={prSeries.isLoading}
          color="#f97316"
          valueLabel="PRs"
        />
        <ThroughputChart
          title="Commits"
          data={commitSeries.data}
          isLoading={commitSeries.isLoading}
          color="#06b6d4"
          valueLabel="Commits"
        />
      </div>

      {/* Row 4: Model distribution + Cycle time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ModelPieChart data={modelDist.data} isLoading={modelDist.isLoading} />
        <CycleTimeChart data={cycleTimeDist.data} isLoading={cycleTimeDist.isLoading} />
      </div>

      {/* Row 5: Success rate */}
      <div className="grid grid-cols-1 gap-3">
        <SuccessChart data={successSeries.data} isLoading={successSeries.isLoading} />
      </div>
    </div>
  );
}

export function MetricsSection({ projectPath }: MetricsSectionProps) {
  return (
    <Tabs defaultValue="project" className="w-full">
      <TabsList className="grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="project">Project</TabsTrigger>
        <TabsTrigger value="all">All Projects</TabsTrigger>
      </TabsList>
      <TabsContent value="project" className="mt-4">
        <ProjectMetricsTab projectPath={projectPath} />
      </TabsContent>
      <TabsContent value="all" className="mt-4">
        <div className="text-center py-12 text-sm text-muted-foreground">
          All Projects view coming soon. Select a project to view its metrics.
        </div>
      </TabsContent>
    </Tabs>
  );
}
