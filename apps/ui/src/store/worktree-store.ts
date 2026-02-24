import { create } from 'zustand';
import { DEFAULT_MAX_CONCURRENCY } from '@protolabs-ai/types';
import type { AutoModeActivity } from './types';

interface WorktreeState {
  // Auto Mode (per-worktree state, keyed by "${projectId}::${branchName ?? '__main__'}")
  autoModeByWorktree: Record<
    string,
    {
      isRunning: boolean;
      runningTasks: string[];
      branchName: string | null;
      maxConcurrency?: number;
    }
  >;
  autoModeActivityLog: AutoModeActivity[];
  maxConcurrency: number; // Legacy

  // Worktree Settings
  useWorktrees: boolean;

  // User-managed Worktrees (per-project)
  currentWorktreeByProject: Record<string, { path: string | null; branch: string }>;
  worktreesByProject: Record<
    string,
    Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  >;
  worktreesLoadingByProject: Record<string, boolean>;

  // Worktree Panel Visibility (per-project)
  worktreePanelVisibleByProject: Record<string, boolean>;

  // Default Delete Branch With Worktree (per-project)
  defaultDeleteBranchByProject: Record<string, boolean>;

  // Use Worktrees Override (per-project)
  useWorktreesByProject: Record<string, boolean | undefined>;

  // UI State
  worktreePanelCollapsed: boolean;
}

interface WorktreeActions {
  // Auto Mode actions (per-worktree)
  setAutoModeRunning: (
    projectId: string,
    branchName: string | null,
    running: boolean,
    maxConcurrency?: number,
    runningTasks?: string[]
  ) => void;
  addRunningTask: (projectId: string, branchName: string | null, taskId: string) => void;
  removeRunningTask: (projectId: string, branchName: string | null, taskId: string) => void;
  clearRunningTasks: (projectId: string, branchName: string | null) => void;
  getAutoModeState: (
    projectId: string,
    branchName: string | null
  ) => {
    isRunning: boolean;
    runningTasks: string[];
    branchName: string | null;
    maxConcurrency?: number;
  };
  getWorktreeKey: (projectId: string, branchName: string | null) => string;
  addAutoModeActivity: (activity: Omit<AutoModeActivity, 'id' | 'timestamp'>) => void;
  clearAutoModeActivity: () => void;
  setMaxConcurrency: (max: number) => void;
  getMaxConcurrencyForWorktree: (projectId: string, branchName: string | null) => number;
  setMaxConcurrencyForWorktree: (
    projectId: string,
    branchName: string | null,
    maxConcurrency: number
  ) => void;

  // Worktree Settings actions
  setUseWorktrees: (enabled: boolean) => void;
  setCurrentWorktree: (projectPath: string, worktreePath: string | null, branch: string) => void;
  setWorktrees: (
    projectPath: string,
    worktrees: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>
  ) => void;
  setWorktreesLoading: (projectPath: string, isLoading: boolean) => void;
  getWorktreesLoading: (projectPath: string) => boolean;
  getCurrentWorktree: (projectPath: string) => { path: string | null; branch: string } | null;
  getWorktrees: (projectPath: string) => Array<{
    path: string;
    branch: string;
    isMain: boolean;
    hasChanges?: boolean;
    changedFilesCount?: number;
  }>;
  isPrimaryWorktreeBranch: (projectPath: string, branchName: string) => boolean;
  getPrimaryWorktreeBranch: (projectPath: string) => string | null;

  // Worktree Panel Visibility actions (per-project)
  setWorktreePanelVisible: (projectPath: string, visible: boolean) => void;
  getWorktreePanelVisible: (projectPath: string) => boolean;

  // Default Delete Branch actions (per-project)
  setDefaultDeleteBranch: (projectPath: string, deleteBranch: boolean) => void;
  getDefaultDeleteBranch: (projectPath: string) => boolean;

  // Use Worktrees Override actions (per-project)
  setProjectUseWorktrees: (projectPath: string, useWorktrees: boolean | null) => void;
  getProjectUseWorktrees: (projectPath: string) => boolean | undefined;
  getEffectiveUseWorktrees: (projectPath: string) => boolean;

  // UI State actions
  setWorktreePanelCollapsed: (collapsed: boolean) => void;
}

const initialState: WorktreeState = {
  autoModeByWorktree: {},
  autoModeActivityLog: [],
  maxConcurrency: DEFAULT_MAX_CONCURRENCY,
  useWorktrees: true,
  currentWorktreeByProject: {},
  worktreesByProject: {},
  worktreesLoadingByProject: {},
  worktreePanelVisibleByProject: {},
  defaultDeleteBranchByProject: {},
  useWorktreesByProject: {},
  worktreePanelCollapsed: false,
};

export const useWorktreeStore = create<WorktreeState & WorktreeActions>()((set, get) => ({
  ...initialState,

  // Auto Mode actions (per-worktree)
  getWorktreeKey: (projectId, branchName) => {
    const normalizedBranch = branchName === 'main' ? null : branchName;
    return `${projectId}::${normalizedBranch ?? '__main__'}`;
  },

  setAutoModeRunning: (
    projectId: string,
    branchName: string | null,
    running: boolean,
    maxConcurrency?: number,
    runningTasks?: string[]
  ) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const current = get().autoModeByWorktree;
    const worktreeState = current[worktreeKey] || {
      isRunning: false,
      runningTasks: [],
      branchName,
      maxConcurrency: maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    };
    set({
      autoModeByWorktree: {
        ...current,
        [worktreeKey]: {
          ...worktreeState,
          isRunning: running,
          branchName,
          maxConcurrency: maxConcurrency ?? worktreeState.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
          runningTasks: runningTasks ?? worktreeState.runningTasks,
        },
      },
    });
  },

  addRunningTask: (projectId, branchName, taskId) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const current = get().autoModeByWorktree;
    const worktreeState = current[worktreeKey] || {
      isRunning: false,
      runningTasks: [],
      branchName,
    };
    if (!worktreeState.runningTasks.includes(taskId)) {
      set({
        autoModeByWorktree: {
          ...current,
          [worktreeKey]: {
            ...worktreeState,
            runningTasks: [...worktreeState.runningTasks, taskId],
            branchName,
          },
        },
      });
    }
  },

  removeRunningTask: (projectId, branchName, taskId) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const current = get().autoModeByWorktree;
    const worktreeState = current[worktreeKey] || {
      isRunning: false,
      runningTasks: [],
      branchName,
    };
    set({
      autoModeByWorktree: {
        ...current,
        [worktreeKey]: {
          ...worktreeState,
          runningTasks: worktreeState.runningTasks.filter((id) => id !== taskId),
          branchName,
        },
      },
    });
  },

  clearRunningTasks: (projectId, branchName) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const current = get().autoModeByWorktree;
    const worktreeState = current[worktreeKey] || {
      isRunning: false,
      runningTasks: [],
      branchName,
    };
    set({
      autoModeByWorktree: {
        ...current,
        [worktreeKey]: { ...worktreeState, runningTasks: [], branchName },
      },
    });
  },

  getAutoModeState: (projectId, branchName) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const worktreeState = get().autoModeByWorktree[worktreeKey];
    return (
      worktreeState || {
        isRunning: false,
        runningTasks: [],
        branchName,
        maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      }
    );
  },

  getMaxConcurrencyForWorktree: (projectId, branchName) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const worktreeState = get().autoModeByWorktree[worktreeKey];
    return worktreeState?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  },

  setMaxConcurrencyForWorktree: (projectId, branchName, maxConcurrency) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const current = get().autoModeByWorktree;
    const worktreeState = current[worktreeKey] || {
      isRunning: false,
      runningTasks: [],
      branchName,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    };
    set({
      autoModeByWorktree: {
        ...current,
        [worktreeKey]: { ...worktreeState, maxConcurrency, branchName },
      },
    });
  },

  addAutoModeActivity: (activity) => {
    const id = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newActivity: AutoModeActivity = {
      ...activity,
      id,
      timestamp: new Date(),
    };

    const currentLog = get().autoModeActivityLog;
    const updatedLog = [...currentLog, newActivity].slice(-100);

    set({ autoModeActivityLog: updatedLog });
  },

  clearAutoModeActivity: () => set({ autoModeActivityLog: [] }),

  setMaxConcurrency: (max) => set({ maxConcurrency: max }),

  // Worktree Settings actions
  setUseWorktrees: (enabled) => set({ useWorktrees: enabled }),

  setCurrentWorktree: (projectPath, worktreePath, branch) => {
    const current = get().currentWorktreeByProject;
    set({
      currentWorktreeByProject: {
        ...current,
        [projectPath]: { path: worktreePath, branch },
      },
    });
  },

  setWorktrees: (projectPath, worktrees) => {
    const current = get().worktreesByProject;
    set({
      worktreesByProject: {
        ...current,
        [projectPath]: worktrees,
      },
    });
  },

  setWorktreesLoading: (projectPath, isLoading) => {
    const current = get().worktreesLoadingByProject;
    set({
      worktreesLoadingByProject: {
        ...current,
        [projectPath]: isLoading,
      },
    });
  },

  getWorktreesLoading: (projectPath) => {
    return get().worktreesLoadingByProject[projectPath] ?? true;
  },

  getCurrentWorktree: (projectPath) => {
    return get().currentWorktreeByProject[projectPath] ?? null;
  },

  getWorktrees: (projectPath) => {
    return get().worktreesByProject[projectPath] ?? [];
  },

  isPrimaryWorktreeBranch: (projectPath, branchName) => {
    const worktrees = get().worktreesByProject[projectPath] ?? [];
    const primary = worktrees.find((w) => w.isMain);
    return primary?.branch === branchName;
  },

  getPrimaryWorktreeBranch: (projectPath) => {
    const worktrees = get().worktreesByProject[projectPath] ?? [];
    const primary = worktrees.find((w) => w.isMain);
    return primary?.branch ?? null;
  },

  // Worktree Panel Visibility actions (per-project)
  setWorktreePanelVisible: (projectPath, visible) => {
    set({
      worktreePanelVisibleByProject: {
        ...get().worktreePanelVisibleByProject,
        [projectPath]: visible,
      },
    });
  },

  getWorktreePanelVisible: (projectPath) => {
    return get().worktreePanelVisibleByProject[projectPath] ?? true;
  },

  // Default Delete Branch actions (per-project)
  setDefaultDeleteBranch: (projectPath, deleteBranch) => {
    set({
      defaultDeleteBranchByProject: {
        ...get().defaultDeleteBranchByProject,
        [projectPath]: deleteBranch,
      },
    });
  },

  getDefaultDeleteBranch: (projectPath) => {
    return get().defaultDeleteBranchByProject[projectPath] ?? false;
  },

  // Use Worktrees Override actions (per-project)
  setProjectUseWorktrees: (projectPath, useWorktrees) => {
    const newValue = useWorktrees === null ? undefined : useWorktrees;
    set({
      useWorktreesByProject: {
        ...get().useWorktreesByProject,
        [projectPath]: newValue,
      },
    });
  },

  getProjectUseWorktrees: (projectPath) => {
    return get().useWorktreesByProject[projectPath];
  },

  getEffectiveUseWorktrees: (projectPath) => {
    const projectSetting = get().useWorktreesByProject[projectPath];
    if (projectSetting !== undefined) {
      return projectSetting;
    }
    return get().useWorktrees;
  },

  // UI State actions
  setWorktreePanelCollapsed: (collapsed) => set({ worktreePanelCollapsed: collapsed }),
}));
