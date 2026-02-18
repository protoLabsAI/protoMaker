import { Card, CardContent } from '@protolabs/ui/atoms';
import { DollarSign, CheckCircle2, TrendingUp, Zap } from 'lucide-react';

interface MetricCardsProps {
  totalCost: number;
  completedFeatures: number;
  totalFeatures: number;
  successRate: number;
  throughputPerDay: number;
  isLoading: boolean;
}

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MetricCards({
  totalCost,
  completedFeatures,
  totalFeatures,
  successRate,
  throughputPerDay,
  isLoading,
}: MetricCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Total Cost"
        value={`$${totalCost.toFixed(2)}`}
        icon={DollarSign}
        subtitle="all-time spend"
      />
      <StatCard
        label="Features"
        value={`${completedFeatures}`}
        icon={CheckCircle2}
        subtitle={`of ${totalFeatures} total`}
      />
      <StatCard
        label="Success Rate"
        value={`${successRate.toFixed(0)}%`}
        icon={TrendingUp}
        subtitle="first-attempt pass"
      />
      <StatCard
        label="Throughput"
        value={`${throughputPerDay.toFixed(1)}/day`}
        icon={Zap}
        subtitle="avg features completed"
      />
    </div>
  );
}
