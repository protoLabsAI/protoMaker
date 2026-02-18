/**
 * AnalyticsView — System Flow Graph + Idea Pipeline
 *
 * Tab bar view with:
 * - System Graph: React Flow system architecture with floating panels
 * - Idea Pipeline: Idea intake and processing flow
 *
 * Feature node clicks navigate to the board for editing.
 */

import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { FlowGraphView } from './flow-graph';
import { IdeaFlowView } from './idea-flow/idea-flow-view';

export function AnalyticsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;
  const navigate = useNavigate();
  const { tab } = useSearch({ from: '/analytics' });

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      // Navigate to board — the feature will be highlighted there
      navigate({ to: '/board', search: { featureId } });
    },
    [navigate]
  );

  const handleTabChange = useCallback(
    (newTab: 'system' | 'ideas') => {
      navigate({ to: '/analytics', search: { tab: newTab } });
    },
    [navigate]
  );

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a project to view analytics</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/50">
        <button
          onClick={() => handleTabChange('system')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'system'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
        >
          System Graph
        </button>
        <button
          onClick={() => handleTabChange('ideas')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'ideas'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
        >
          Idea Pipeline
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'system' ? (
          <FlowGraphView projectPath={projectPath} onFeatureClick={handleFeatureClick} />
        ) : (
          <IdeaFlowView projectPath={projectPath} />
        )}
      </div>
    </div>
  );
}
