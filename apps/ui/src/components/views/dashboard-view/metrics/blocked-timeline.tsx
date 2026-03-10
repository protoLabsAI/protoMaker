/**
 * BlockedTimeline - Gantt-style chart showing blocked periods per feature.
 *
 * Renders a horizontal BarChart (layout="vertical") where each row represents
 * a feature and each bar segment represents a blocked period, color-coded by
 * reason category: dependency, review, unclear, other.
 *
 * Part of the Value Stream section in the dashboard metrics tab.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { useChartColors } from '@/hooks/use-chart-colors';
import { useBlockedTimeline } from '@/hooks/queries/use-metrics';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatDuration } from '@protolabsai/utils';

interface BlockedTimelineProps {
  projectPath: string;
}

/** Map reason category → display label */
const CATEGORY_LABELS: Record<string, string> = {
  dependency: 'Dependency',
  review: 'Review',
  unclear: 'Unclear',
  other: 'Other',
};

interface ChartDatum {
  featureTitle: string;
  featureId: string;
  durationMs: number;
  reason: string;
  category: string;
}

interface TooltipPayload {
  payload?: ChartDatum;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        fontSize: '12px',
        padding: '8px 12px',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.featureTitle}</p>
      <p>Duration: {formatDuration(d.durationMs)}</p>
      <p>Reason: {d.reason}</p>
      <p>Category: {CATEGORY_LABELS[d.category] ?? d.category}</p>
    </div>
  );
}

export function BlockedTimeline({ projectPath }: BlockedTimelineProps) {
  const colors = useChartColors();
  const { data, isLoading } = useBlockedTimeline(projectPath);

  /** Category → color mapping using chart color palette */
  const categoryColors: Record<string, string> = useMemo(
    () => ({
      dependency: colors.chart1,
      review: colors.chart3,
      unclear: colors.chart5,
      other: colors.chart4,
    }),
    [colors]
  );

  /** Flatten all blocked periods into one datum per bar segment */
  const chartData: ChartDatum[] = useMemo(() => {
    if (!data?.features?.length) return [];
    return data.features.flatMap((feature) =>
      feature.blockedPeriods.map((period) => ({
        featureTitle: feature.title,
        featureId: feature.featureId,
        durationMs: period.durationMs,
        reason: period.reason,
        category: period.category,
      }))
    );
  }, [data]);

  /** Unique feature titles for Y-axis ticks (one row per feature) */
  const featureTitles = useMemo(() => {
    if (!data?.features?.length) return [];
    return data.features.map((f) => f.title);
  }, [data]);

  const isEmpty = !isLoading && (!data?.features?.length || chartData.length === 0);
  const chartHeight = Math.max(160, featureTitles.length * 40 + 40);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Blocked Feature Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading && (
          <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}
        {isEmpty && (
          <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
            No blocked periods found
          </div>
        )}
        {!isLoading && !isEmpty && (
          <>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-3">
              {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                <div key={cat} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: categoryColors[cat] }}
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    dataKey="durationMs"
                    tick={{ fontSize: 10, fill: colors.mutedForeground }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatDuration(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="featureTitle"
                    width={120}
                    tick={{ fontSize: 10, fill: colors.mutedForeground }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 16) + '…' : v)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="durationMs" radius={[0, 4, 4, 0]} minPointSize={4}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={categoryColors[entry.category] ?? colors.chart1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
