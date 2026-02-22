/**
 * MetricsSection - Tabbed dashboard with charts and KPIs
 *
 * Contains Project Metrics tab, All Projects tab, and System Health tab.
 * Uses persistent ledger data that survives feature archival.
 * Supports WebSocket-driven real-time updates.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Globe, Activity } from 'lucide-react';
import { AnimatedTabs } from '@/components/dashboard';
import { ProjectMetricsTab } from './project-tab';
import { SystemTab } from './system-tab';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { EventType } from '@automaker/types';

interface MetricsSectionProps {
  projectPath: string;
}

export function MetricsSection({ projectPath }: MetricsSectionProps) {
  const [activeTab, setActiveTab] = useState('project');
  const queryClient = useQueryClient();

  const tabs = [
    { id: 'project', label: 'Project Metrics', icon: BarChart3 },
    { id: 'all', label: 'All Projects', icon: Globe },
    { id: 'health', label: 'System Health', icon: Activity },
  ];

  // Invalidate queries on relevant WebSocket events
  const handleEvent = useCallback(
    (type: EventType, _payload: any) => {
      // Invalidate on feature completion
      if (type === 'feature:completed') {
        queryClient.invalidateQueries({ queryKey: queryKeys.metrics.ledgerAggregate(projectPath) });
        queryClient.invalidateQueries({
          queryKey: ['metrics', 'ledger', 'timeSeries', projectPath],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.metrics.modelDistribution(projectPath),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.metrics.cycleTimeDistribution(projectPath),
        });
      }

      // Invalidate on agent lifecycle events
      if (type === 'feature:started' || type === 'feature:stopped') {
        queryClient.invalidateQueries({ queryKey: queryKeys.metrics.capacity(projectPath) });
        queryClient.invalidateQueries({ queryKey: queryKeys.runningAgents.all() });
      }
    },
    [projectPath, queryClient]
  );

  // Subscribe to WebSocket events for real-time updates
  useEffect(() => {
    if (!projectPath) return;

    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: EventType, payload: unknown) => {
      handleEvent(type, payload);
    });

    return () => {
      unsubscribe();
    };
  }, [projectPath, handleEvent]);

  return (
    <AnimatedTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'project' && <ProjectMetricsTab projectPath={projectPath} />}
      {activeTab === 'all' && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          All Projects view coming soon. Select a project to view its metrics.
        </div>
      )}
      {activeTab === 'health' && <SystemTab projectPath={projectPath} />}
    </AnimatedTabs>
  );
}
