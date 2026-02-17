/**
 * CostChart - Area chart showing cost over time
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartColors } from '@/hooks/use-chart-colors';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CostChartProps {
  data?: { points: Array<{ date: string; value: number }> };
  isLoading: boolean;
}

export function CostChart({ data, isLoading }: CostChartProps) {
  const colors = useChartColors();

  if (isLoading || !data?.points?.length) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Cost Burn</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'No cost data yet'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.points.map((p) => ({
    date: p.date.slice(5), // MM-DD
    cost: Number(p.value.toFixed(2)),
  }));

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Cost Burn</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
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
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(2)}`, 'Cost']}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke={colors.primary}
                fill="url(#costGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
