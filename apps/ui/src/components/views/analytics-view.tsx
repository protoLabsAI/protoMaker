import { useAppStore } from '@/store/app-store';
import { useProjectMetrics, useCapacityMetrics } from '@/hooks/queries/use-metrics';
import { useFeatures, useRunningAgentsCount } from '@/hooks/queries';
import { MetricCards } from './analytics-view/metric-cards';
import { VelocityPanel } from './analytics-view/velocity-panel';
import { CostPanel } from './analytics-view/cost-panel';
import { CapacityPanel } from './analytics-view/capacity-panel';
import { SystemStatusPanel } from './analytics-view/system-status-panel';
import { ActivityFeed } from './analytics-view/activity-feed';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useCallback, useState, useEffect } from 'react';

export function AnalyticsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;
  const queryClient = useQueryClient();

  const { data: metricsData, isLoading: metricsLoading } = useProjectMetrics(projectPath);
  const { data: capacityData, isLoading: capacityLoading } = useCapacityMetrics(projectPath);
  const { data: features, isLoading: featuresLoading } = useFeatures(projectPath);
  const { data: runningAgentsCount } = useRunningAgentsCount();

  // Track auto-mode status from session storage
  const [autoModeRunning, setAutoModeRunning] = useState(false);
  useEffect(() => {
    if (!projectPath) return;
    try {
      const raw = window.sessionStorage?.getItem('automaker:autoModeRunningByWorktreeKey');
      if (raw) {
        const parsed = JSON.parse(raw);
        const key = `${projectPath}::__main__`;
        setAutoModeRunning(!!parsed[key]);
      }
    } catch {
      // ignore
    }
  }, [projectPath]);

  // Track unread notifications
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useEffect(() => {
    if (!projectPath) return;
    const stored = localStorage.getItem(`automaker:unread-notifications:${projectPath}`);
    if (stored) {
      try {
        setUnreadNotifications(parseInt(stored, 10) || 0);
      } catch {
        setUnreadNotifications(0);
      }
    }
  }, [projectPath]);

  const handleRefresh = useCallback(() => {
    if (!projectPath) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.summary(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.capacity(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.features.all(projectPath) });
  }, [projectPath, queryClient]);

  // Extract metrics with safe defaults
  const metrics = metricsData as Record<string, unknown> | undefined;
  const capacity = capacityData as Record<string, unknown> | undefined;

  const totalCost = Number(metrics?.totalCostUsd ?? 0);
  const completedFeatures = Number(metrics?.completedFeatures ?? 0);
  const totalFeatures = Number(metrics?.totalFeatures ?? 0);
  const successRate = Number(metrics?.successRate ?? 0);
  const throughputPerDay = Number(metrics?.throughputPerDay ?? 0);
  const avgCycleTimeMs = Number(metrics?.avgCycleTimeMs ?? 0);
  const avgAgentTimeMs = Number(metrics?.avgAgentTimeMs ?? 0);
  const avgPrReviewTimeMs = Number(metrics?.avgPrReviewTimeMs ?? 0);
  const costByModel = (metrics?.costByModel as Record<string, number>) ?? {};

  const utilizationPercent = Number(capacity?.utilizationPercent ?? 0);
  const currentConcurrency = Number(capacity?.currentConcurrency ?? 0);
  const maxConcurrency = Number(capacity?.maxConcurrency ?? 3);
  const backlogSize = Number(capacity?.backlogSize ?? 0);
  const blockedCount = Number(capacity?.blockedCount ?? 0);
  const reviewCount = Number(capacity?.reviewCount ?? 0);
  const estimatedBacklogTimeMs = Number(capacity?.estimatedBacklogTimeMs ?? 0);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a project to view analytics</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">{currentProject.name}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-card hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <MetricCards
          totalCost={totalCost}
          completedFeatures={completedFeatures}
          totalFeatures={totalFeatures}
          successRate={successRate}
          throughputPerDay={throughputPerDay}
          isLoading={metricsLoading}
        />

        {/* Two-column grid: Velocity + Cost */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VelocityPanel
            avgCycleTimeMs={avgCycleTimeMs}
            avgAgentTimeMs={avgAgentTimeMs}
            avgPrReviewTimeMs={avgPrReviewTimeMs}
            estimatedBacklogTimeMs={estimatedBacklogTimeMs}
            isLoading={metricsLoading || capacityLoading}
          />
          <CostPanel costByModel={costByModel} totalCost={totalCost} isLoading={metricsLoading} />
        </div>

        {/* Two-column grid: Capacity + System Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CapacityPanel
            utilizationPercent={utilizationPercent}
            currentConcurrency={currentConcurrency}
            maxConcurrency={maxConcurrency}
            backlogSize={backlogSize}
            blockedCount={blockedCount}
            reviewCount={reviewCount}
            isLoading={capacityLoading}
          />
          <SystemStatusPanel
            autoModeRunning={autoModeRunning}
            runningAgentsCount={runningAgentsCount ?? 0}
            backlogSize={backlogSize}
            reviewCount={reviewCount}
            unreadNotifications={unreadNotifications}
            isLoading={capacityLoading}
          />
        </div>

        {/* Activity Feed */}
        <ActivityFeed features={features ?? []} isLoading={featuresLoading} />
      </div>
    </div>
  );
}
