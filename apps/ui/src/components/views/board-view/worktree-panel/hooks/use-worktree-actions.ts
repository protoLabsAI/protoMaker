import { useState, useCallback } from 'react';
import { createLogger } from '@protolabsai/utils/logger';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import {
  useSwitchBranch,
  usePullWorktree,
  usePushWorktree,
  useOpenInEditor,
} from '@/hooks/mutations';
import { useTerminalStore } from '@/store/terminal-store';
import { useAppStore } from '@/store/app-store';
import type { WorktreeInfo } from '../types';

const logger = createLogger('WorktreeActions');

export function useWorktreeActions() {
  const [isActivating, setIsActivating] = useState(false);

  // Use React Query mutations
  const switchBranchMutation = useSwitchBranch();
  const pullMutation = usePullWorktree();
  const pushMutation = usePushWorktree();
  const openInEditorMutation = useOpenInEditor();

  const handleSwitchBranch = useCallback(
    async (worktree: WorktreeInfo, branchName: string) => {
      if (switchBranchMutation.isPending || branchName === worktree.branch) return;
      switchBranchMutation.mutate({
        worktreePath: worktree.path,
        branchName,
      });
    },
    [switchBranchMutation]
  );

  const handlePull = useCallback(
    async (worktree: WorktreeInfo) => {
      if (pullMutation.isPending) return;
      pullMutation.mutate(worktree.path);
    },
    [pullMutation]
  );

  const handlePush = useCallback(
    async (worktree: WorktreeInfo) => {
      if (pushMutation.isPending) return;
      pushMutation.mutate({
        worktreePath: worktree.path,
      });
    },
    [pushMutation]
  );

  const handleOpenInIntegratedTerminal = useCallback(
    (worktree: WorktreeInfo, mode?: 'tab' | 'split') => {
      // Open the bottom panel and queue a terminal creation request
      if (!useAppStore.getState().bottomPanelOpen) {
        useAppStore.getState().toggleBottomPanel();
      }
      useTerminalStore.getState().setPendingTerminalRequest({
        cwd: worktree.path,
        branch: worktree.branch,
        mode,
        nonce: Date.now(),
      });
    },
    []
  );

  const handleOpenInEditor = useCallback(
    async (worktree: WorktreeInfo, editorCommand?: string) => {
      openInEditorMutation.mutate({
        worktreePath: worktree.path,
        editorCommand,
      });
    },
    [openInEditorMutation]
  );

  const handleOpenInExternalTerminal = useCallback(
    async (worktree: WorktreeInfo, terminalId?: string) => {
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.openInExternalTerminal) {
          logger.warn('Open in external terminal API not available');
          return;
        }
        const result = await api.worktree.openInExternalTerminal(worktree.path, terminalId);
        if (result.success && result.result) {
          toast.success(result.result.message);
        } else if (result.error) {
          toast.error(result.error);
        }
      } catch (error) {
        logger.error('Open in external terminal failed:', error);
      }
    },
    []
  );

  return {
    isPulling: pullMutation.isPending,
    isPushing: pushMutation.isPending,
    isSwitching: switchBranchMutation.isPending,
    isActivating,
    setIsActivating,
    handleSwitchBranch,
    handlePull,
    handlePush,
    handleOpenInIntegratedTerminal,
    handleOpenInEditor,
    handleOpenInExternalTerminal,
  };
}
