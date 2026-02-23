import { Card, CardContent, CardHeader, CardTitle } from '@protolabs/ui/atoms';
import { DollarSign } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface CostPanelProps {
  costByModel: Record<string, number>;
  totalCost: number;
  isLoading: boolean;
}

const MODEL_COLORS: Record<string, string> = {
  sonnet: '#8b5cf6',
  opus: '#f59e0b',
  haiku: '#10b981',
};

const FALLBACK_COLORS = ['#6366f1', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

function getModelColor(model: string, index: number): string {
  const key = model.toLowerCase();
  if (key.includes('sonnet')) return MODEL_COLORS.sonnet;
  if (key.includes('opus')) return MODEL_COLORS.opus;
  if (key.includes('haiku')) return MODEL_COLORS.haiku;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function getModelLabel(model: string): string {
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('haiku')) return 'Haiku';
  // Trim long model IDs
  return model.length > 20 ? model.slice(0, 18) + '...' : model;
}

export function CostPanel({ costByModel, totalCost, isLoading }: CostPanelProps) {
  const entries = Object.entries(costByModel)
    .filter(([, cost]) => cost > 0)
    .sort(([, a], [, b]) => b - a);

  const chartData = entries.map(([model, cost], i) => ({
    name: getModelLabel(model),
    value: Number(cost.toFixed(2)),
    fill: getModelColor(model, i),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4" />
          Cost Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-40 animate-pulse rounded bg-muted" />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No cost data yet</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={50}
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | undefined) => [
                      `$${(value ?? 0).toFixed(2)}`,
                      'Cost',
                    ]}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {entries.map(([model, cost], i) => (
                <div key={model} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getModelColor(model, i) }}
                    />
                    <span className="text-muted-foreground truncate">{getModelLabel(model)}</span>
                  </div>
                  <span className="font-medium tabular-nums shrink-0">
                    ${cost.toFixed(2)}
                    {totalCost > 0 && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({((cost / totalCost) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
