/**
 * AnalyticsView — System Flow Graph
 *
 * React Flow system architecture with floating panels.
 * Feature node clicks navigate to the board for editing.
 * Includes auto-mode controls for starting/stopping concurrent agent execution.
 */

import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useShallow } from 'zustand/react/shallow';
import { Label } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import { createLogger } from '@protolabs-ai/utils/logger';
import { DEFAULT_MAX_CONCURRENCY } from '@protolabs-ai/types';
import { useAppStore } from '@/store/app-store';
import { useWorktreeStore } from '@/store/worktree-store';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import { FlowGraphView } from './flow-graph';
import { AutoModeSettingsPopover } from './board-view/dialogs/auto-mode-settings-popover';

const logger = createLogger('AnalyticsView');

export function AnalyticsView() {
  const { currentProject, skipVerificationInAutoMode, setSkipVerificationInAutoMode } = useAppStore(
    useShallow((s) => ({
      currentProject: s.currentProject,
      skipVerificationInAutoMode: s.skipVerificationInAutoMode,
      setSkipVerificationInAutoMode: s.setSkipVerificationInAutoMode,
    }))
  );
  const projectPath = currentProject?.path;
  const navigate = useNavigate();

  // Use main worktree auto-mode (no worktree arg = null branchName = main)
  const autoMode = useAutoMode(undefined);
  const runningAutoTasks = autoMode.runningTasks;
  const maxConcurrency = autoMode.maxConcurrency;

  const setMaxConcurrencyForWorktree = useWorktreeStore(
    (state) => state.setMaxConcurrencyForWorktree
  );
  const updateGlobalSettings = useUpdateGlobalSettings({ showSuccessToast: false });

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      navigate({ to: '/board', search: { featureId } });
    },
    [navigate]
  );

  const handleConcurrencyChange = useCallback(
    (newMaxConcurrency: number) => {
      if (!currentProject) return;
      setMaxConcurrencyForWorktree(currentProject.id, null, newMaxConcurrency);
      const worktreeKey = `${currentProject.id}::__main__`;
      const currentAutoMode = useWorktreeStore.getState().autoModeByWorktree;
      const persistedAutoMode: Record<
        string,
        { maxConcurrency: number; branchName: string | null }
      > = {};
      for (const [key, value] of Object.entries(currentAutoMode)) {
        persistedAutoMode[key] = {
          maxConcurrency: value.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
          branchName: value.branchName,
        };
      }
      persistedAutoMode[worktreeKey] = { maxConcurrency: newMaxConcurrency, branchName: null };
      updateGlobalSettings.mutate({ autoModeByWorktree: persistedAutoMode });
      if (autoMode.isRunning) {
        autoMode.stop().then(() => {
          autoMode.start().catch((error) => {
            logger.error('[AutoMode] Failed to restart with new concurrency:', error);
          });
        });
      }
    },
    [currentProject, setMaxConcurrencyForWorktree, updateGlobalSettings, autoMode]
  );

  const handleAutoModeToggle = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        autoMode.start().catch((error) => {
          logger.error('[AutoMode] Failed to start:', error);
        });
      } else {
        autoMode.stop().catch((error) => {
          logger.error('[AutoMode] Failed to stop:', error);
        });
      }
    },
    [autoMode]
  );

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a project to view analytics</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Auto-mode controls toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 bg-card/50 shrink-0">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="analytics-auto-mode-toggle"
            className="text-xs font-medium cursor-pointer whitespace-nowrap"
          >
            Auto Mode
          </Label>
          <span
            className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
            title="Max concurrent agents"
          >
            {maxConcurrency}
          </span>
          <Switch
            id="analytics-auto-mode-toggle"
            checked={autoMode.isRunning}
            onCheckedChange={handleAutoModeToggle}
            data-testid="analytics-auto-mode-toggle"
          />
          <AutoModeSettingsPopover
            skipVerificationInAutoMode={skipVerificationInAutoMode}
            onSkipVerificationChange={setSkipVerificationInAutoMode}
            maxConcurrency={maxConcurrency}
            runningAgentsCount={runningAutoTasks.length}
            onConcurrencyChange={handleConcurrencyChange}
          />
        </div>
      </div>

      {/* Flow graph */}
      <div className="flex-1 overflow-hidden">
        <FlowGraphView projectPath={projectPath} onFeatureClick={handleFeatureClick} />
      </div>
    </div>
  );
}
