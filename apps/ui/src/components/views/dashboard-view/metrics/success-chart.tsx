/**
 * SuccessChart - Area chart showing success rate over time
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface SuccessChartProps {
  data?: { points: Array<{ date: string; value: number }> };
  isLoading: boolean;
}

export function SuccessChart({ data, isLoading }: SuccessChartProps) {
  if (isLoading || !data?.points?.length) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'No success data yet'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.points.map((p) => ({
    date: p.date.slice(5),
    rate: Number(p.value.toFixed(1)),
  }));

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ReferenceLine
                y={90}
                stroke="var(--chart-3)"
                strokeDasharray="3 3"
                strokeOpacity={0.6}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Success Rate']}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="var(--chart-2)"
                fill="url(#successGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
