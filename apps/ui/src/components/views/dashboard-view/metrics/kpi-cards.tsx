/**
 * KPI Hero Cards - Top-level metrics summary cards
 */

import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, Hash, Zap, Clock, GitPullRequest, GitCommit } from 'lucide-react';

interface KpiCardsProps {
  data?: {
    totalCostUsd: number;
    totalFeatures: number;
    successRate: number;
    throughputPerDay: number;
    avgCycleTimeMs: number;
    prsPerDay: number;
    commitsPerDay: number;
  };
  isLoading: boolean;
}

function formatDuration(ms: number): string {
  if (ms === 0) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatCost(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}

function MetricCard({ label, value, subtitle, icon: Icon, iconColor }: MetricCardProps) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`rounded-lg p-2 ${iconColor}`}>
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

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricCard
        label="Total Cost"
        value={formatCost(data.totalCostUsd)}
        subtitle={`${formatCost(data.totalCostUsd / Math.max(data.totalFeatures, 1))}/feature`}
        icon={DollarSign}
        iconColor="bg-green-500/10 text-green-500"
      />
      <MetricCard
        label="Features"
        value={String(data.totalFeatures)}
        subtitle={`${data.successRate.toFixed(0)}% success`}
        icon={Hash}
        iconColor="bg-blue-500/10 text-blue-500"
      />
      <MetricCard
        label="Throughput"
        value={`${data.throughputPerDay.toFixed(1)}/d`}
        subtitle="features per day"
        icon={Zap}
        iconColor="bg-yellow-500/10 text-yellow-500"
      />
      <MetricCard
        label="Cycle Time"
        value={formatDuration(data.avgCycleTimeMs)}
        subtitle="avg per feature"
        icon={Clock}
        iconColor="bg-purple-500/10 text-purple-500"
      />
      <MetricCard
        label="PRs/Day"
        value={data.prsPerDay.toFixed(1)}
        subtitle="merged per day"
        icon={GitPullRequest}
        iconColor="bg-orange-500/10 text-orange-500"
      />
      <MetricCard
        label="Commits/Day"
        value={data.commitsPerDay.toFixed(1)}
        subtitle="per day"
        icon={GitCommit}
        iconColor="bg-cyan-500/10 text-cyan-500"
      />
    </div>
  );
}
