/**
 * DoraTrendCharts — DORA metrics trend visualizations
 *
 * Two charts:
 *  1. Multi-line chart: lead time + recovery time over a configurable time window
 *  2. Bar chart: deployment frequency + change failure rate side by side
 *
 * Time window selector (7d / 30d / 90d) filters data client-side.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { useChartColors } from '@/hooks/use-chart-colors';
import { useDoraHistory } from '@/hooks/queries/use-metrics';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type DoraTimeWindow = '7d' | '30d' | '90d';

const TIME_WINDOWS: { value: DoraTimeWindow; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
];

interface DoraTimeWindowSelectorProps {
  value: DoraTimeWindow;
  onChange: (w: DoraTimeWindow) => void;
}

function DoraTimeWindowSelector({ value, onChange }: DoraTimeWindowSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
      {TIME_WINDOWS.map((w) => (
        <button
          key={w.value}
          onClick={() => onChange(w.value)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === w.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

interface DoraTrendChartsProps {
  projectPath: string;
}

export function DoraTrendCharts({ projectPath }: DoraTrendChartsProps) {
  const [timeWindow, setTimeWindow] = useState<DoraTimeWindow>('30d');
  const colors = useChartColors();

  const { data, isLoading } = useDoraHistory(projectPath, timeWindow);

  const chartData = useMemo(() => {
    if (!data?.buckets?.length) return [];
    return data.buckets.map((b) => ({
      date: b.date.slice(5), // MM-DD
      leadTime: b.leadTime,
      recoveryTime: b.recoveryTime,
      deployFreq: b.deploymentFrequency,
      cfr: Number((b.changeFailureRate * 100).toFixed(1)),
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

  const gridProps = {
    strokeDasharray: '3 3',
    stroke: colors.border,
    strokeOpacity: 0.5,
  };

  const emptyMessage = isLoading ? 'Loading...' : 'No DORA history yet';

  return (
    <div className="space-y-3">
      {/* Section header with time window selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">DORA Trends</h3>
        <DoraTimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>

      {/* Row: Lead Time + Recovery Time multi-line chart */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Lead Time &amp; Recovery Time (hours)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {!chartData.length ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis
                    {...axisProps}
                    tickFormatter={(v: number) => `${v}h`}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number | undefined) =>
                      [`${value ?? 0}h`, ''] as [string, string]
                    }
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === 'leadTime' ? 'Lead Time' : 'Recovery Time'
                    }
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="leadTime"
                    stroke={colors.chart1}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="recoveryTime"
                    stroke={colors.chart3}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row: Deployment Frequency + CFR bar chart */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Deploy Frequency &amp; Change Failure Rate
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {!chartData.length ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number | undefined) =>
                      [`${value ?? 0}`, ''] as [string, string]
                    }
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === 'deployFreq' ? 'Deploy Freq' : 'Change Failure Rate'
                    }
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                  <Bar dataKey="deployFreq" fill={colors.chart2} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cfr" fill={colors.destructive} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
