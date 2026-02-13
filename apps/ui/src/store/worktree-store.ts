/**
 * Worktree Store - State management for git worktree isolation
 */

import { create } from 'zustand';
import { DEFAULT_MAX_CONCURRENCY } from '@automaker/types';

// ============================================================================
// Types
// ============================================================================

/** State for worktree init script execution */
export interface InitScriptState {
  status: 'idle' | 'running' | 'success' | 'failed';
  branch: string;
  output: string[];
  error?: string;
}

/** Activity log entry for auto mode operations */
export interface AutoModeActivity {
  id: string;
  featureId: string;
  timestamp: Date;
  type:
    | 'start'
    | 'progress'
    | 'tool'
    | 'complete'
    | 'error'
    | 'planning'
    | 'action'
    | 'verification';
  message: string;
  tool?: string;
  passes?: boolean;
  phase?: 'planning' | 'action' | 'verification';
  errorType?: 'authentication' | 'execution';
}

// ============================================================================
// State Interface
// ============================================================================

interface WorktreeStoreState {
  // Auto Mode (per-worktree state, keyed by "${projectId}::${branchName ?? '__main__'}")
  autoModeByWorktree: Record<
    string,
    {
      isRunning: boolean;
      runningTasks: string[]; // Feature IDs being worked on
      branchName: string | null; // null = main worktree
      maxConcurrency?: number; // Maximum concurrent features for this worktree (defaults to 3)
    }
  >;
  autoModeActivityLog: AutoModeActivity[];
  maxConcurrency: number; // Legacy: Maximum number of concurrent agent tasks (deprecated, use per-worktree maxConcurrency)

  // Worktree Settings
  useWorktrees: boolean; // Whether to use git worktree isolation for features (default: true)

  // User-managed Worktrees (per-project)
  // projectPath -> { path: worktreePath or null for main, branch: branch name }
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
  // Track loading state for worktrees per project
  worktreesLoadingByProject: Record<string, boolean>;

  // Worktree Panel Visibility (per-project, keyed by project path)
  // Whether the worktree panel row is visible (default: true)
  worktreePanelVisibleByProject: Record<string, boolean>;

  // Init Script Indicator Visibility (per-project, keyed by project path)
  // Whether to show the floating init script indicator panel (default: true)
  showInitScriptIndicatorByProject: Record<string, boolean>;

  // Default Delete Branch With Worktree (per-project, keyed by project path)
  // Whether to default the "delete branch" checkbox when deleting a worktree (default: false)
  defaultDeleteBranchByProject: Record<string, boolean>;

  // Auto-dismiss Init Script Indicator (per-project, keyed by project path)
  // Whether to auto-dismiss the indicator after completion (default: true)
  autoDismissInitScriptIndicatorByProject: Record<string, boolean>;

  // Use Worktrees Override (per-project, keyed by project path)
  // undefined = use global setting, true/false = project-specific override
  useWorktreesByProject: Record<string, boolean | undefined>;

  // Init Script State (keyed by "projectPath::branch" to support concurrent scripts)
  initScriptState: Record<string, InitScriptState>;

  // UI State
  /** Whether worktree panel is collapsed in board view */
  worktreePanelCollapsed: boolean;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface WorktreeActions {
  // Auto Mode actions (per-worktree)
  /** Helper to generate worktree key from projectId and branchName */
  getWorktreeKey: (projectId: string, branchName: string | null) => string;
  setAutoModeState: (
    projectId: string,
    branchName: string | null,
    running: boolean,
    maxConcurrency?: number,
    runningTasks?: string[]
  ) => {
    isRunning: boolean;
    runningTasks: string[];
    branchName: string | null;
    maxConcurrency?: number;
  };
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
  addAutoModeActivity: (activity: Omit<AutoModeActivity, 'id' | 'timestamp'>) => void;
  clearAutoModeActivity: () => void;
  setMaxConcurrency: (max: number) => void; // Legacy: kept for backward compatibility
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

  // Init Script Indicator Visibility actions (per-project)
  setShowInitScriptIndicator: (projectPath: string, visible: boolean) => void;
  getShowInitScriptIndicator: (projectPath: string) => boolean;

  // Default Delete Branch actions (per-project)
  setDefaultDeleteBranch: (projectPath: string, deleteBranch: boolean) => void;
  getDefaultDeleteBranch: (projectPath: string) => boolean;

  // Auto-dismiss Init Script Indicator actions (per-project)
  setAutoDismissInitScriptIndicator: (projectPath: string, autoDismiss: boolean) => void;
  getAutoDismissInitScriptIndicator: (projectPath: string) => boolean;

  // Use Worktrees Override actions (per-project)
  setProjectUseWorktrees: (projectPath: string, useWorktrees: boolean | null) => void; // null = use global
  getProjectUseWorktrees: (projectPath: string) => boolean | undefined; // undefined = using global
  getEffectiveUseWorktrees: (projectPath: string) => boolean; // Returns actual value (project or global fallback)

  // UI State actions
  setWorktreePanelCollapsed: (collapsed: boolean) => void;

  // Init Script State actions (keyed by "projectPath::branch" to support concurrent scripts)
  setInitScriptState: (
    projectPath: string,
    branch: string,
    state: Partial<InitScriptState>
  ) => void;
  appendInitScriptOutput: (projectPath: string, branch: string, content: string) => void;
  clearInitScriptState: (projectPath: string, branch: string) => void;
  getInitScriptState: (projectPath: string, branch: string) => InitScriptState | null;
  getInitScriptStatesForProject: (
    projectPath: string
  ) => Array<{ key: string; state: InitScriptState }>;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_INIT_OUTPUT_LINES = 1000; // Maximum lines to keep in init script output buffer

// ============================================================================
// Initial State
// ============================================================================

const initialState: WorktreeStoreState = {
  autoModeByWorktree: {},
  autoModeActivityLog: [],
  maxConcurrency: DEFAULT_MAX_CONCURRENCY, // Default concurrent agents
  useWorktrees: true, // Default to enabled (git worktree isolation)
  currentWorktreeByProject: {},
  worktreesByProject: {},
  worktreesLoadingByProject: {}, // Track loading state per project (default=true via getter)
  worktreePanelVisibleByProject: {},
  showInitScriptIndicatorByProject: {},
  defaultDeleteBranchByProject: {},
  autoDismissInitScriptIndicatorByProject: {},
  useWorktreesByProject: {},
  initScriptState: {},
  worktreePanelCollapsed: false,
};

// ============================================================================
// Store
// ============================================================================

export const useWorktreeStore = create<WorktreeStoreState & WorktreeActions>()((set, get) => ({
  ...initialState,

  // Auto Mode actions (per-worktree)
  getWorktreeKey: (projectId, branchName) => {
    // Normalize 'main' to null so it matches the main worktree key
    // The backend sometimes sends 'main' while the UI uses null for the main worktree
    const normalizedBranch = branchName === 'main' ? null : branchName;
    return `${projectId}::${normalizedBranch ?? '__main__'}`;
  },

  setAutoModeState: (projectId, branchName, running, maxConcurrency, runningTasks) => {
    const worktreeKey = get().getWorktreeKey(projectId, branchName);
    const current = get().autoModeByWorktree;
    const worktreeState = current[worktreeKey] || {
      isRunning: false,
      runningTasks: [],
      branchName,
    };

    const newState = {
      isRunning: running,
      runningTasks: runningTasks ?? worktreeState.runningTasks,
      branchName,
      maxConcurrency: maxConcurrency ?? worktreeState.maxConcurrency,
    };

    set({
      autoModeByWorktree: {
        ...current,
        [worktreeKey]: newState,
      },
    });

    return newState;
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
          runningTasks: worktreeState.runningTasks.filter((t) => t !== taskId),
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
        [worktreeKey]: {
          ...worktreeState,
          runningTasks: [],
        },
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

    // Keep only last 1000 activities to prevent unbounded growth
    const updatedLog = [...get().autoModeActivityLog, newActivity].slice(-1000);

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
    return get().worktreesLoadingByProject[projectPath] ?? true; // Default to loading=true for safety
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
    // Default to true (visible) if not set
    return get().worktreePanelVisibleByProject[projectPath] ?? true;
  },

  // Init Script Indicator Visibility actions (per-project)
  setShowInitScriptIndicator: (projectPath, visible) => {
    set({
      showInitScriptIndicatorByProject: {
        ...get().showInitScriptIndicatorByProject,
        [projectPath]: visible,
      },
    });
  },

  getShowInitScriptIndicator: (projectPath) => {
    // Default to true (visible) if not set
    return get().showInitScriptIndicatorByProject[projectPath] ?? true;
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
    // Default to false (don't delete branch) if not set
    return get().defaultDeleteBranchByProject[projectPath] ?? false;
  },

  // Auto-dismiss Init Script Indicator actions (per-project)
  setAutoDismissInitScriptIndicator: (projectPath, autoDismiss) => {
    set({
      autoDismissInitScriptIndicatorByProject: {
        ...get().autoDismissInitScriptIndicatorByProject,
        [projectPath]: autoDismiss,
      },
    });
  },

  getAutoDismissInitScriptIndicator: (projectPath) => {
    // Default to true (auto-dismiss enabled) if not set
    return get().autoDismissInitScriptIndicatorByProject[projectPath] ?? true;
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
    // Returns undefined if using global setting, true/false if project-specific
    return get().useWorktreesByProject[projectPath];
  },

  getEffectiveUseWorktrees: (projectPath) => {
    // Returns the actual value to use (project override or global fallback)
    const projectSetting = get().useWorktreesByProject[projectPath];
    if (projectSetting !== undefined) {
      return projectSetting;
    }
    return get().useWorktrees;
  },

  // UI State actions
  setWorktreePanelCollapsed: (collapsed) => set({ worktreePanelCollapsed: collapsed }),

  // Init Script State actions (keyed by "projectPath::branch")
  setInitScriptState: (projectPath, branch, state) => {
    const key = `${projectPath}::${branch}`;
    const current = get().initScriptState[key] || {
      status: 'idle',
      branch,
      output: [],
    };
    set({
      initScriptState: {
        ...get().initScriptState,
        [key]: { ...current, ...state },
      },
    });
  },

  appendInitScriptOutput: (projectPath, branch, content) => {
    const key = `${projectPath}::${branch}`;
    // Initialize state if absent to avoid dropping output due to event-order races
    const current = get().initScriptState[key] || {
      status: 'idle' as const,
      branch,
      output: [],
    };
    // Append new content and enforce fixed-size buffer to prevent memory bloat
    const newOutput = [...current.output, content].slice(-MAX_INIT_OUTPUT_LINES);
    set({
      initScriptState: {
        ...get().initScriptState,
        [key]: {
          ...current,
          output: newOutput,
        },
      },
    });
  },

  clearInitScriptState: (projectPath, branch) => {
    const key = `${projectPath}::${branch}`;

    const { [key]: _, ...rest } = get().initScriptState;
    set({ initScriptState: rest });
  },

  getInitScriptState: (projectPath, branch) => {
    const key = `${projectPath}::${branch}`;
    return get().initScriptState[key] || null;
  },

  getInitScriptStatesForProject: (projectPath) => {
    const prefix = `${projectPath}::`;
    const states = get().initScriptState;
    return Object.entries(states)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, state]) => ({ key, state }));
  },
}));

// Export types for convenience
export type WorktreeStore = typeof useWorktreeStore;
