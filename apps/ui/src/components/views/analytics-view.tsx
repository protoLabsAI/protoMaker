/**
 * AnalyticsView — System Flow Graph (full-screen hero)
 *
 * Renders the React Flow system architecture graph with floating panels.
 * Feature node clicks navigate to the board for editing.
 */

import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { FlowGraphView } from './flow-graph';

export function AnalyticsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;
  const navigate = useNavigate();

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      // Navigate to board — the feature will be highlighted there
      navigate({ to: '/board', search: { featureId } });
    },
    [navigate]
  );

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a project to view system graph</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <FlowGraphView projectPath={projectPath} onFeatureClick={handleFeatureClick} />
    </div>
  );
}
