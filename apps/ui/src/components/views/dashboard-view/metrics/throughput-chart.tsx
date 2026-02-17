/**
 * ThroughputChart - Bar chart showing features completed per period
 * Also used for PR throughput and commit throughput
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartColors } from '@/hooks/use-chart-colors';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ThroughputChartProps {
  title: string;
  data?: { points: Array<{ date: string; value: number }> };
  isLoading: boolean;
  color?: string;
  valueLabel?: string;
}

export function ThroughputChart({
  title,
  data,
  isLoading,
  color,
  valueLabel = 'Features',
}: ThroughputChartProps) {
  const colors = useChartColors();

  if (isLoading || !data?.points?.length) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'No data yet'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.points.map((p) => ({
    date: p.date.slice(5), // MM-DD
    value: p.value,
  }));

  const barColor = color ?? colors.primary;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: colors.mutedForeground }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: colors.mutedForeground }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined) => [value ?? 0, valueLabel]}
              />
              <Bar dataKey="value" fill={barColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
