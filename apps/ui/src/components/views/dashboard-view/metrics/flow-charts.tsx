/**
 * FlowCharts — Value Stream Visualization
 *
 * Two charts:
 *  1. Cumulative Flow Diagram (CFD): stacked area chart showing backlog /
 *     in_progress / review / done counts over time.
 *  2. WIP Trend: line chart showing in_progress count with a WIP limit
 *     reference line.
 *
 * Requires at least 7 days of history; shows an empty state otherwise.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { useChartColors } from '@/hooks/use-chart-colors';
import { useFlowMetrics } from '@/hooks/queries/use-metrics';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const MIN_DAYS_FOR_CHART = 7;

interface FlowChartsProps {
  projectPath: string;
  days?: number;
  wipLimit?: number;
}

export function FlowCharts({ projectPath, days = 90, wipLimit }: FlowChartsProps) {
  const colors = useChartColors();
  const { data, isLoading } = useFlowMetrics(projectPath, days, wipLimit);

  const chartData = useMemo(() => {
    if (!data?.days?.length) return [];
    return data.days.map((d) => ({
      date: d.date.slice(5), // MM-DD
      backlog: d.backlog,
      in_progress: d.in_progress,
      review: d.review,
      done: d.done,
    }));
  }, [data]);

  const resolvedWipLimit = data?.wipLimit ?? wipLimit ?? 5;
  const hasEnoughData = chartData.length >= MIN_DAYS_FOR_CHART;

  const tooltipStyle = {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
  };

  const axisProps = {
    tick: { fontSize: 10, fill: colors.mutedForeground },
    axisLine: false as const,
    tickLine: false as const,
  };

  const gridProps = {
    strokeDasharray: '3 3' as const,
    stroke: colors.border,
    strokeOpacity: 0.5,
  };

  const emptyMessage = isLoading ? 'Loading...' : 'Not enough history yet (need 7+ days)';

  return (
    <div className="space-y-3">
      {/* Section header */}
      <h3 className="text-sm font-medium text-muted-foreground">Value Stream</h3>

      {/* Cumulative Flow Diagram */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Cumulative Flow Diagram
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {!hasEnoughData ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cfdDoneGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.chart2} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={colors.chart2} stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="cfdReviewGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.chart3} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={colors.chart3} stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="cfdInProgressGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.chart1} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={colors.chart1} stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="cfdBacklogGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.muted} stopOpacity={0.6} />
                      <stop offset="95%" stopColor={colors.muted} stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value ?? 0,
                      name === 'in_progress'
                        ? 'In Progress'
                        : name
                          ? name.charAt(0).toUpperCase() + name.slice(1)
                          : '',
                    ]}
                  />
                  <Legend
                    formatter={(value: string) => {
                      if (value === 'in_progress') return 'In Progress';
                      return value.charAt(0).toUpperCase() + value.slice(1);
                    }}
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="done"
                    stackId="cfd"
                    stroke={colors.chart2}
                    fill="url(#cfdDoneGradient)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="review"
                    stackId="cfd"
                    stroke={colors.chart3}
                    fill="url(#cfdReviewGradient)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="in_progress"
                    stackId="cfd"
                    stroke={colors.chart1}
                    fill="url(#cfdInProgressGradient)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="backlog"
                    stackId="cfd"
                    stroke={colors.mutedForeground}
                    fill="url(#cfdBacklogGradient)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* WIP Trend */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            WIP Trend (In Progress)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {!hasEnoughData ? (
            <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number | undefined) =>
                      [value ?? 0, 'In Progress'] as [number, string]
                    }
                  />
                  <ReferenceLine
                    y={resolvedWipLimit}
                    stroke={colors.destructive}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `WIP limit: ${resolvedWipLimit}`,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: colors.destructive,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="in_progress"
                    stroke={colors.chart1}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                    name="In Progress"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
