/**
 * DORA KPI Cards - DORA metrics summary cards
 *
 * Displays 5 DORA KPI cards: Lead Time, Deployment Frequency, Change Failure Rate,
 * Recovery Time, and Rework Rate. Each card shows the current value with units,
 * a trend indicator, and threshold-based coloring.
 */

import { Card, CardContent } from '@protolabsai/ui/atoms';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Rocket,
  AlertTriangle,
  HeartPulse,
  RotateCcw,
} from 'lucide-react';
import type { DoraMetrics, MetricValue } from '@protolabsai/types';

interface DoraKpiCardsProps {
  data?: DoraMetrics;
  isLoading: boolean;
  error?: Error | null;
}

type ThresholdStatus = 'healthy' | 'warning' | 'critical';

function getThresholdStatus(
  metric: MetricValue,
  /** For most metrics, higher = worse (e.g. lead time, failure rate).
   *  For deployment frequency, higher = better (lower = worse). */
  higherIsBetter = false
): ThresholdStatus {
  if (!metric.threshold) return 'healthy';
  const { value } = metric;
  const { warning, critical } = metric.threshold;
  if (higherIsBetter) {
    if (value >= warning) return 'healthy';
    if (value >= critical) return 'warning';
    return 'critical';
  }
  if (value <= warning) return 'healthy';
  if (value <= critical) return 'warning';
  return 'critical';
}

function statusToColorClass(status: ThresholdStatus): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500/10 text-green-500';
    case 'warning':
      return 'bg-yellow-500/10 text-yellow-500';
    case 'critical':
      return 'bg-red-500/10 text-red-500';
  }
}

function statusToValueColor(status: ThresholdStatus): string {
  switch (status) {
    case 'healthy':
      return 'text-green-500';
    case 'warning':
      return 'text-yellow-500';
    case 'critical':
      return 'text-red-500';
  }
}

function TrendIcon({ trend }: { trend?: MetricValue['trend'] }) {
  if (trend === 'improving') {
    return <TrendingUp className="h-3 w-3 text-green-500" />;
  }
  if (trend === 'degrading') {
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  }
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

interface DoraMetricCardProps {
  label: string;
  metric: MetricValue;
  icon: React.ComponentType<{ className?: string }>;
  higherIsBetter?: boolean;
  formatValue?: (value: number, unit: string) => string;
}

function DoraMetricCard({
  label,
  metric,
  icon: Icon,
  higherIsBetter = false,
  formatValue,
}: DoraMetricCardProps) {
  const status = getThresholdStatus(metric, higherIsBetter);
  const iconColor = statusToColorClass(status);
  const valueColor = statusToValueColor(status);
  const displayValue = formatValue
    ? formatValue(metric.value, metric.unit)
    : `${metric.value.toFixed(1)} ${metric.unit}`;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold tracking-tight ${valueColor}`}>{displayValue}</p>
            <div className="flex items-center gap-1">
              <TrendIcon trend={metric.trend} />
              <p className="text-xs text-muted-foreground capitalize">{metric.trend ?? 'stable'}</p>
            </div>
          </div>
          <div className={`rounded-lg p-2 ml-2 flex-shrink-0 ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="space-y-2">
          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
          <div className="h-7 w-20 bg-muted animate-pulse rounded" />
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatLeadTime(value: number, unit: string): string {
  // value is in hours
  if (unit === 'hours') {
    if (value < 1) return `${Math.round(value * 60)}m`;
    if (value < 24) return `${value.toFixed(1)}h`;
    return `${(value / 24).toFixed(1)}d`;
  }
  return `${value.toFixed(1)} ${unit}`;
}

function formatRecoveryTime(value: number, unit: string): string {
  return formatLeadTime(value, unit);
}

function formatPercent(value: number, _unit: string): string {
  return `${value.toFixed(1)}%`;
}

function formatFrequency(value: number, unit: string): string {
  return `${value.toFixed(2)} ${unit}`;
}

export function DoraKpiCards({ data, isLoading, error }: DoraKpiCardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">DORA Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">DORA Metrics</h3>
        <div className="rounded-md border border-border/50 bg-card/50 px-4 py-3 text-sm text-muted-foreground">
          Failed to load DORA metrics
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">DORA Metrics</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <DoraMetricCard
          label="Lead Time"
          metric={data.leadTime}
          icon={Clock}
          higherIsBetter={false}
          formatValue={formatLeadTime}
        />
        <DoraMetricCard
          label="Deploy Frequency"
          metric={data.deploymentFrequency}
          icon={Rocket}
          higherIsBetter={true}
          formatValue={formatFrequency}
        />
        <DoraMetricCard
          label="Change Failure Rate"
          metric={data.changeFailureRate}
          icon={AlertTriangle}
          higherIsBetter={false}
          formatValue={formatPercent}
        />
        <DoraMetricCard
          label="Recovery Time"
          metric={data.recoveryTime}
          icon={HeartPulse}
          higherIsBetter={false}
          formatValue={formatRecoveryTime}
        />
        <DoraMetricCard
          label="Rework Rate"
          metric={data.reworkRate}
          icon={RotateCcw}
          higherIsBetter={false}
          formatValue={formatPercent}
        />
      </div>
    </div>
  );
}
