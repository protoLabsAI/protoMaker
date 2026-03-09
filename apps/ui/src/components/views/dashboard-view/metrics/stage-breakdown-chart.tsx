/**
 * StageBreakdownChart — Per-feature stage cycle time analytics
 *
 * Stacked bar chart showing how long features spend in each status
 * (backlog, in_progress, review, blocked), plus a flow efficiency metric
 * (active work / total elapsed time).
 *
 * Data comes from GET /api/metrics/stage-durations via useStageDurations hook.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { useChartColors } from '@/hooks/use-chart-colors';
import { useStageDurations } from '@/hooks/queries/use-metrics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface StageBreakdownChartProps {
  projectPath: string;
}

export function StageBreakdownChart({ projectPath }: StageBreakdownChartProps) {
  const colors = useChartColors();
  const { data, isLoading } = useStageDurations(projectPath);

  /** Map each tracked status to a chart color. */
  const stageColors: Record<string, string> = {
    backlog: colors.chart3,
    in_progress: colors.chart1,
    review: colors.chart2,
    blocked: colors.destructive,
  };

  const stageLabels: Record<string, string> = {
    backlog: 'Backlog',
    in_progress: 'In Progress',
    review: 'Review',
    blocked: 'Blocked',
  };

  const chartData = useMemo(() => {
    if (!data?.features?.length) return [];
    // Only include features that have any tracked time
    return data.features
      .filter((f) => f.totalMs > 0)
      .slice(0, 20) // cap at 20 features to avoid crowding
      .map((f) => ({
        name: f.title.length > 20 ? `${f.title.slice(0, 18)}…` : f.title,
        backlog: Math.round(f.stages['backlog'] / 1000 / 60 / 60),
        in_progress: Math.round(f.stages['in_progress'] / 1000 / 60 / 60),
        review: Math.round(f.stages['review'] / 1000 / 60 / 60),
        blocked: Math.round(f.stages['blocked'] / 1000 / 60 / 60),
      }));
  }, [data]);

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

  const flowEfficiency = data?.aggregate?.flowEfficiency ?? 0;
  const flowPct = Math.round(flowEfficiency * 100);

  const stagePercentages = data?.aggregate?.percentages;

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Stage Cycle Time Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Stage Cycle Time Breakdown
          </CardTitle>
          {/* Flow efficiency badge */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Flow efficiency</span>
            <span
              className={`font-semibold ${
                flowPct >= 40
                  ? 'text-green-500'
                  : flowPct >= 20
                    ? 'text-yellow-500'
                    : 'text-destructive'
              }`}
            >
              {flowPct}%
            </span>
          </div>
        </div>
        {/* Aggregate percentage pills */}
        {stagePercentages && (
          <div className="flex flex-wrap gap-2 mt-1">
            {(['backlog', 'in_progress', 'review', 'blocked'] as const).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted/60"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: stageColors[s] }}
                />
                {stageLabels[s]}: {stagePercentages[s] ?? 0}%
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        {!chartData.length ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
            No stage history data yet
          </div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 10, left: 0, bottom: 40 }}
                layout="vertical"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={colors.border}
                  strokeOpacity={0.5}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  {...axisProps}
                  tickFormatter={(v: number) => `${v}h`}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 9, fill: colors.mutedForeground }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number | undefined, name: string | undefined) =>
                    [`${value ?? 0}h`, stageLabels[name ?? ''] ?? name ?? ''] as [string, string]
                  }
                />
                <Legend
                  formatter={(value: string) => stageLabels[value] ?? value}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                />
                <Bar
                  dataKey="backlog"
                  stackId="stages"
                  fill={stageColors['backlog']}
                  name="backlog"
                />
                <Bar
                  dataKey="in_progress"
                  stackId="stages"
                  fill={stageColors['in_progress']}
                  name="in_progress"
                />
                <Bar dataKey="review" stackId="stages" fill={stageColors['review']} name="review" />
                <Bar
                  dataKey="blocked"
                  stackId="stages"
                  fill={stageColors['blocked']}
                  name="blocked"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
