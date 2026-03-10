/**
 * DoraMetricsPanel — unified DORA + agentic metrics panel
 *
 * Shows:
 *  - DORA metric trends (sparklines for lead time, deploy frequency, CFR, recovery)
 *  - Current autonomy rate
 *  - WIP saturation gauges per pipeline stage
 *  - Cost-per-feature trend
 *
 * Reuses chart patterns from dora-trend-charts.tsx and system-tab.tsx.
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@protolabsai/ui/atoms';
import { Bot, Layers, DollarSign, Clock, Rocket, AlertTriangle, HeartPulse } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useDora, useDoraHistory, useLedgerAggregate } from '@/hooks/queries/use-metrics';
import { useTimeRangeDates } from './time-range';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { useChartColors } from '@/hooks/use-chart-colors';
import type { AgenticWipSaturation } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Agentic metrics hook
// ---------------------------------------------------------------------------

function useAgenticMetrics(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['metrics', 'agentic', projectPath],
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getHttpApiClient();
      return api.metrics.agenticMetrics(projectPath);
    },
    enabled: !!projectPath,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Tiny sparkline for a numeric series */
function Sparkline({
  data,
  color,
  dataKey,
}: {
  data: Record<string, unknown>[];
  color: string;
  dataKey: string;
}) {
  if (!data.length) {
    return <div className="h-10 flex items-center text-xs text-muted-foreground">No data</div>;
  }
  return (
    <div className="h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '11px',
            }}
            formatter={(v: unknown) => [String(v), '']}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single DORA sparkline card */
function DoraSparkCard({
  label,
  value,
  unit,
  sparkData,
  sparkKey,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  sparkData: Record<string, unknown>[];
  sparkKey: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-3 pb-2 px-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <Icon className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className="text-lg font-bold tabular-nums">
          {value !== undefined ? `${value.toFixed(1)} ${unit}` : '—'}
        </p>
        <Sparkline data={sparkData} color={color} dataKey={sparkKey} />
      </CardContent>
    </Card>
  );
}

/** Autonomy rate ring indicator */
function AutonomyRateCard({ rate, totalDone }: { rate: number; totalDone: number }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-3 pb-2 px-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">Autonomy Rate</p>
          <Bot className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className={`text-lg font-bold tabular-nums ${color}`}>{pct}%</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalDone} features delivered autonomously
        </p>
      </CardContent>
    </Card>
  );
}

/** WIP saturation bar for a single stage */
function WipBar({ stage, currentWip, wipLimit, saturation }: AgenticWipSaturation) {
  const pct = saturation !== null ? Math.min(saturation * 100, 100) : null;
  const barColor =
    pct === null
      ? 'bg-muted'
      : pct >= 90
        ? 'bg-red-500'
        : pct >= 70
          ? 'bg-yellow-500'
          : 'bg-green-500';

  const stageLabel: Record<string, string> = {
    execution: 'Execution',
    review: 'Review',
    approval: 'Approval',
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{stageLabel[stage] ?? stage}</span>
        <span className="text-xs font-medium tabular-nums">
          {currentWip}
          {wipLimit !== null ? ` / ${wipLimit}` : ''}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        {pct !== null && (
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

/** Trend icon for cost change */
function CostTrend({ costPerFeature }: { costPerFeature: number }) {
  // Simple display — no historical comparison here, just the value
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-3 pb-2 px-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">Cost / Feature</p>
          <DollarSign className="h-3 w-3 text-muted-foreground" />
        </div>
        <p className="text-lg font-bold tabular-nums">
          {costPerFeature >= 1 ? `$${costPerFeature.toFixed(2)}` : `$${costPerFeature.toFixed(4)}`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">avg per completed feature</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface DoraMetricsPanelProps {
  projectPath: string;
}

export function DoraMetricsPanel({ projectPath }: DoraMetricsPanelProps) {
  const colors = useChartColors();
  const { startDate, endDate } = useTimeRangeDates('30d');

  const dora = useDora(projectPath);
  const doraHistory = useDoraHistory(projectPath, '30d');
  const ledger = useLedgerAggregate(projectPath, startDate, endDate);
  const agentic = useAgenticMetrics(projectPath);

  // Build sparkline data from DORA history buckets
  const sparkData = (doraHistory.data?.buckets ?? []).map((b) => ({
    date: b.date.slice(5),
    leadTime: Number(b.leadTime.toFixed(1)),
    deployFreq: Number(b.deploymentFrequency.toFixed(2)),
    cfr: Number((b.changeFailureRate * 100).toFixed(1)),
    recoveryTime: Number(b.recoveryTime.toFixed(1)),
  }));

  const doraMetrics = dora.data?.metrics;
  const agenticLatest = agentic.data?.latest ?? null;
  const wipSaturation: AgenticWipSaturation[] = agenticLatest?.wipSaturation ?? [
    { stage: 'execution', currentWip: 0, wipLimit: null, saturation: null },
    { stage: 'review', currentWip: 0, wipLimit: null, saturation: null },
    { stage: 'approval', currentWip: 0, wipLimit: null, saturation: null },
  ];
  const autonomyRate = agenticLatest?.autonomyRate ?? { rate: 0, totalDone: 0, autonomousDone: 0 };
  const costPerFeature = ledger.data?.avgCostPerFeature ?? 0;

  const isLoading = dora.isLoading || doraHistory.isLoading || ledger.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Metrics Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="pt-3 pb-2 px-4">
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-12 bg-muted animate-pulse rounded" />
                  <div className="h-10 bg-muted animate-pulse rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section: DORA Sparklines */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">DORA Trends (30d)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DoraSparkCard
            label="Lead Time"
            value={doraMetrics?.leadTime.value}
            unit="h"
            sparkData={sparkData}
            sparkKey="leadTime"
            color={colors.chart1}
            icon={Clock}
          />
          <DoraSparkCard
            label="Deploy Frequency"
            value={doraMetrics?.deploymentFrequency.value}
            unit="/day"
            sparkData={sparkData}
            sparkKey="deployFreq"
            color={colors.chart2}
            icon={Rocket}
          />
          <DoraSparkCard
            label="Change Failure Rate"
            value={
              doraMetrics?.changeFailureRate.value !== undefined
                ? doraMetrics.changeFailureRate.value * 100
                : undefined
            }
            unit="%"
            sparkData={sparkData}
            sparkKey="cfr"
            color={colors.destructive}
            icon={AlertTriangle}
          />
          <DoraSparkCard
            label="Recovery Time"
            value={doraMetrics?.recoveryTime.value}
            unit="h"
            sparkData={sparkData}
            sparkKey="recoveryTime"
            color={colors.chart3}
            icon={HeartPulse}
          />
        </div>
      </div>

      {/* Section: Agentic Health */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Agentic Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Autonomy Rate */}
          <AutonomyRateCard rate={autonomyRate.rate} totalDone={autonomyRate.autonomousDone} />

          {/* WIP Saturation */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50 md:col-span-1">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3 w-3" />
                WIP Saturation
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4 space-y-2.5">
              {wipSaturation.map((wip) => (
                <WipBar key={wip.stage} {...wip} />
              ))}
            </CardContent>
          </Card>

          {/* Cost / Feature */}
          <CostTrend costPerFeature={costPerFeature} />
        </div>
      </div>
    </div>
  );
}
