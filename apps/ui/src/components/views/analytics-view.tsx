/**
 * AnalyticsView - Unified analytics dashboard with tabbed metrics
 *
 * Renders MetricsSection with animated tabs for Project Metrics,
 * All Projects, and System Health. Replaces the old panel-based dashboard.
 */

import { useAppStore } from '@/store/app-store';
import { MetricsSection } from './dashboard-view/metrics/metrics-section';
import { LiveIndicator } from '@/components/dashboard';
import { useRunningAgentsCount } from '@/hooks/queries';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useCallback } from 'react';

export function AnalyticsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;
  const queryClient = useQueryClient();
  const { data: runningAgentsCount } = useRunningAgentsCount();

  const handleRefresh = useCallback(() => {
    if (!projectPath) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.ledgerAggregate(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.capacity(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.timeSeries(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.modelDistribution(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.metrics.cycleTimeDistribution(projectPath) });
    queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
  }, [projectPath, queryClient]);

  // Determine overall system status
  const getSystemStatus = (): { color: 'green' | 'blue' | 'amber' | 'red'; label: string } => {
    const count = runningAgentsCount ?? 0;
    if (count === 0) {
      return { color: 'green', label: 'Idle' };
    }
    if (count >= 3) {
      return { color: 'amber', label: 'High Load' };
    }
    return { color: 'blue', label: 'Active' };
  };

  const systemStatus = getSystemStatus();

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
        {/* Header with LiveIndicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">{currentProject.name}</p>
            </div>
            <LiveIndicator label={systemStatus.label} color={systemStatus.color} />
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-card hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Tabbed Metrics Section */}
        <MetricsSection projectPath={projectPath} />
      </div>
    </div>
  );
}
