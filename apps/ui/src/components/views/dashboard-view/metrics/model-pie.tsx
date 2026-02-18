/**
 * ModelPieChart - Donut chart showing cost distribution by model
 */

import { Card, CardContent, CardHeader, CardTitle } from '@protolabs/ui/atoms';
import { useChartColors, type ChartColors } from '@/hooks/use-chart-colors';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function getModelColors(colors: ChartColors): Record<string, string> {
  return {
    sonnet: colors.chart1,
    opus: colors.chart3,
    haiku: colors.chart2,
  };
}

interface ModelPieChartProps {
  data?: { distribution: Record<string, number> };
  isLoading: boolean;
}

export function ModelPieChart({ data, isLoading }: ModelPieChartProps) {
  const colors = useChartColors();
  const modelColors = getModelColors(colors);

  if (isLoading || !data?.distribution || Object.keys(data.distribution).length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Model Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            {isLoading ? 'Loading...' : 'No model data yet'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = Object.entries(data.distribution).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: Number(value.toFixed(2)),
    key: name,
  }));

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Model Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={modelColors[entry.key] || colors.muted}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(2)}`, 'Cost']}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
