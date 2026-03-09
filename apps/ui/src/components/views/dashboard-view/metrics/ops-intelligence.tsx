/**
 * OpsIntelligence - Operational Intelligence dashboard section
 *
 * Two panels:
 *   1. FrictionPatternList  — ranked list of recurring failure patterns with horizontal bar indicators
 *   2. FailureDonutChart    — donut chart of failure classification categories
 */

import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { useChartColors } from '@/hooks/use-chart-colors';
import { useFrictionPatterns, useFailureBreakdown } from '@/hooks/queries/use-metrics';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// ---------------------------------------------------------------------------
// Failure category colour mapping
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  scope_creep: 'Scope Creep',
  test_failure: 'Test Failure',
  type_error: 'Type Error',
  git_conflict: 'Git Conflict',
  merge_conflict: 'Merge Conflict',
  transient: 'Transient',
  rate_limit: 'Rate Limit',
  tool_error: 'Tool Error',
  dependency: 'Dependency',
  validation: 'Validation',
  authentication: 'Authentication',
  quota: 'Quota',
  unknown: 'Unknown',
};

function labelForCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

// ---------------------------------------------------------------------------
// FrictionPatternList
// ---------------------------------------------------------------------------

interface FrictionPatternListProps {
  projectPath?: string;
}

export function FrictionPatternList({ projectPath: _projectPath }: FrictionPatternListProps) {
  const { data, isLoading } = useFrictionPatterns();

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Friction Patterns
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  const patterns = data?.patterns ?? [];

  if (patterns.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Friction Patterns
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
            No friction patterns detected
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...patterns.map((p) => p.count), 1);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Friction Patterns
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-3">
          {patterns.map((p) => {
            const pct = Math.round((p.count / maxCount) * 100);
            const lastSeen = new Date(p.lastSeen).toLocaleDateString();
            return (
              <div key={p.pattern} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground font-medium truncate max-w-[60%]">
                    {labelForCategory(p.pattern)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {p.count}x · {lastSeen}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive/70 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FailureDonutChart
// ---------------------------------------------------------------------------

interface FailureDonutChartProps {
  projectPath: string | undefined;
}

export function FailureDonutChart({ projectPath }: FailureDonutChartProps) {
  const colors = useChartColors();
  const { data, isLoading } = useFailureBreakdown(projectPath);

  const CHART_COLORS = [
    colors.chart1,
    colors.chart2,
    colors.chart3,
    colors.chart4,
    colors.chart5,
    colors.muted,
  ];

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Failure Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  const categories = data?.categories ?? [];

  if (categories.length === 0) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Failure Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            No failure classifications yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = categories.map((c) => ({
    name: labelForCategory(c.category),
    value: c.count,
    key: c.category,
  }));

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Failure Breakdown
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
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.key}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
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
                formatter={(value: number | undefined) => [value ?? 0, 'occurrences']}
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
