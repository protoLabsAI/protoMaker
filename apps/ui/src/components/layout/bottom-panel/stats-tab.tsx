import { useAppStore, type Feature } from '@/store/app-store';
import {
  useCapacityMetrics,
  useLedgerAggregate,
  useEngineStatus,
} from '@/hooks/queries/use-metrics';
import { DollarSign, Zap, TrendingUp, Clock, GitPullRequest, Timer } from 'lucide-react';

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-muted/50 px-3 py-2">
      <span className={`text-lg font-bold tabular-nums ${color ?? ''}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30">
      <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function StatsTab() {
  const features = useAppStore((s) => s.features);
  const currentProject = useAppStore((s) => s.currentProject);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: capacity } = useCapacityMetrics(currentProject?.path) as { data: any };
  const { data: ledger } = useLedgerAggregate(currentProject?.path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: engineStatus } = useEngineStatus() as { data: any };

  const backlog = features.filter((f: Feature) => (f.status as string) === 'backlog').length;
  const inProgress = features.filter(
    (f: Feature) => (f.status as string) === 'in_progress' || (f.status as string) === 'running'
  ).length;
  const review = features.filter((f: Feature) => (f.status as string) === 'review').length;
  const done = features.filter(
    (f: Feature) =>
      (f.status as string) === 'done' ||
      (f.status as string) === 'verified' ||
      (f.status as string) === 'completed'
  ).length;
  const blocked = features.filter((f: Feature) => (f.status as string) === 'blocked').length;

  const utilizationPercent = capacity?.utilizationPercent ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = ledger as Record<string, any> | undefined;

  // Budget tracking data
  const prFeedback = engineStatus?.prFeedback;
  const totalPrIterations =
    prFeedback?.prs?.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, pr: any) => sum + (pr.iterationCount ?? 0),
      0
    ) ?? 0;
  const trackedPrCount = prFeedback?.trackedPRs ?? 0;

  // Active cost: sum of costUsd for in-progress features
  const activeCost = features
    .filter(
      (f: Feature) => (f.status as string) === 'in_progress' || (f.status as string) === 'running'
    )
    .reduce((sum: number, f: Feature) => sum + ((f as { costUsd?: number }).costUsd ?? 0), 0);

  // Avg agent time: compute from features with both startedAt and completedAt
  const completedWithTimes = features.filter((f: Feature) => {
    const fe = f as { startedAt?: string; completedAt?: string };
    return fe.startedAt && fe.completedAt;
  });
  const avgAgentTimeMs =
    completedWithTimes.length > 0
      ? completedWithTimes.reduce((sum: number, f: Feature) => {
          const fe = f as { startedAt?: string; completedAt?: string };
          return sum + (new Date(fe.completedAt!).getTime() - new Date(fe.startedAt!).getTime());
        }, 0) / completedWithTimes.length
      : 0;

  return (
    <div className="px-3 py-2 h-full overflow-y-auto">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <KpiCard
          icon={DollarSign}
          label="Total Cost"
          value={l?.totalCostUsd != null ? `$${l.totalCostUsd.toFixed(2)}` : '--'}
          color="text-emerald-400"
        />
        <KpiCard
          icon={Zap}
          label="Features"
          value={l?.totalFeatures?.toString() ?? '--'}
          color="text-blue-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Success"
          value={l?.successRate != null ? `${Math.round(l.successRate * 100)}%` : '--'}
          color="text-violet-400"
        />
        <KpiCard
          icon={Clock}
          label="Avg Cycle"
          value={l?.avgCycleTimeMs != null ? `${Math.round(l.avgCycleTimeMs / 60000)}m` : '--'}
          color="text-amber-400"
        />
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        <StatCard label="Backlog" value={backlog} />
        <StatCard label="Active" value={inProgress} color={inProgress > 0 ? 'text-blue-500' : ''} />
        <StatCard label="Review" value={review} color={review > 0 ? 'text-amber-500' : ''} />
        <StatCard label="Blocked" value={blocked} color={blocked > 0 ? 'text-red-500' : ''} />
        <StatCard label="Done" value={done} color={done > 0 ? 'text-green-500' : ''} />
      </div>

      {/* Utilization bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Utilization</span>
          <span className="text-xs font-semibold tabular-nums">
            {utilizationPercent.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(utilizationPercent, 100)}%`,
              backgroundColor:
                utilizationPercent > 80
                  ? 'var(--destructive)'
                  : utilizationPercent > 50
                    ? 'var(--chart-3)'
                    : 'var(--primary)',
            }}
          />
        </div>
      </div>

      {/* Budget Tracking */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
          Budget Tracking
        </p>
        <div className="grid grid-cols-3 gap-2">
          <KpiCard
            icon={GitPullRequest}
            label="PR Iterations"
            value={trackedPrCount > 0 ? `${totalPrIterations} / ${trackedPrCount} PRs` : 'No PRs'}
            color="text-emerald-400"
          />
          <KpiCard
            icon={DollarSign}
            label="Active Cost"
            value={activeCost > 0 ? `$${activeCost.toFixed(2)}` : '$0.00'}
            color="text-amber-400"
          />
          <KpiCard
            icon={Timer}
            label="Avg Agent Time"
            value={avgAgentTimeMs > 0 ? `${Math.round(avgAgentTimeMs / 60000)}m` : '--'}
            color="text-blue-400"
          />
        </div>
      </div>
    </div>
  );
}
