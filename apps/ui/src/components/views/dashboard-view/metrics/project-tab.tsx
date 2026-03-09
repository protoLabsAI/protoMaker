/**
 * ProjectMetricsTab - Main project metrics dashboard tab
 *
 * Displays KPI hero cards, cost burn chart, throughput charts,
 * model distribution donut, cycle time distribution, and success rate chart.
 * All charts are filtered by the TimeRangeSelector.
 */

import { useState } from 'react';
import {
  useLedgerAggregate,
  useTimeSeries,
  useModelDistribution,
  useCycleTimeDistribution,
  useDora,
} from '@/hooks/queries/use-metrics';
import { StageBreakdownChart } from './stage-breakdown-chart';
import { useChartColors } from '@/hooks/use-chart-colors';
import { TimeRangeSelector, useTimeRangeDates, type TimeRange } from './time-range';
import { KpiCards } from './kpi-cards';
import { DoraKpiCards } from './dora-kpi-cards';
import { DoraTrendCharts } from './dora-trend-charts';
import { CostChart } from './cost-chart';
import { ThroughputChart } from './throughput-chart';
import { ModelPieChart } from './model-pie';
import { CycleTimeChart } from './cycle-time-chart';
import { SuccessChart } from './success-chart';
import { FlowCharts } from './flow-charts';
import { FrictionPatternList, FailureDonutChart } from './ops-intelligence';
import { BlockedTimeline } from './blocked-timeline';

interface ProjectMetricsTabProps {
  projectPath: string;
  timeRange?: TimeRange;
}

export function ProjectMetricsTab({
  projectPath,
  timeRange: controlledTimeRange,
}: ProjectMetricsTabProps) {
  const colors = useChartColors();
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>('30d');
  const timeRange = controlledTimeRange ?? internalTimeRange;
  const { startDate, endDate } = useTimeRangeDates(timeRange);

  const aggregate = useLedgerAggregate(projectPath, startDate, endDate);
  const dora = useDora(projectPath);
  const costSeries = useTimeSeries(projectPath, 'cost', 'day', startDate, endDate);
  const throughputSeries = useTimeSeries(projectPath, 'throughput', 'day', startDate, endDate);
  const prSeries = useTimeSeries(projectPath, 'pr_throughput', 'day', startDate, endDate);
  const commitSeries = useTimeSeries(projectPath, 'commit_throughput', 'day', startDate, endDate);
  const successSeries = useTimeSeries(projectPath, 'success_rate', 'day', startDate, endDate);
  const modelDist = useModelDistribution(projectPath, startDate, endDate);
  const cycleTimeDist = useCycleTimeDistribution(projectPath, startDate, endDate);

  return (
    <div className="space-y-4">
      {!controlledTimeRange && (
        <div className="flex items-center justify-end">
          <TimeRangeSelector value={internalTimeRange} onChange={setInternalTimeRange} />
        </div>
      )}

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

      {/* DORA KPI Cards */}
      <DoraKpiCards data={dora.data?.metrics} isLoading={dora.isLoading} error={dora.error} />

      {/* DORA Trend Charts */}
      <DoraTrendCharts projectPath={projectPath} />

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
          color={colors.chart5}
          valueLabel="PRs"
        />
        <ThroughputChart
          title="Commits"
          data={commitSeries.data}
          isLoading={commitSeries.isLoading}
          color={colors.chart4}
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

      {/* Row 6: Stage cycle time breakdown */}
      <div className="grid grid-cols-1 gap-3">
        <StageBreakdownChart projectPath={projectPath} />
      </div>

      {/* Row 7: Value Stream (CFD + WIP trend) */}
      <FlowCharts projectPath={projectPath} />

      {/* Operational Intelligence */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Operational Intelligence
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FrictionPatternList projectPath={projectPath} />
          <FailureDonutChart projectPath={projectPath} />
        </div>
      </div>

      {/* Row 8: Blocked Feature Timeline */}
      <div className="grid grid-cols-1 gap-3">
        <BlockedTimeline projectPath={projectPath} />
      </div>
    </div>
  );
}
