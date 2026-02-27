import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FileTab {
  id: string;
  /** Absolute path to the file */
  path: string;
  /** Display name (filename) */
  name: string;
}

interface FileEditorState {
  /** Currently open file tabs (persisted across navigation) */
  openTabs: FileTab[];
  /** ID of the currently active tab */
  activeTabId: string | null;
  /** Set of relative directory paths that are expanded in the file tree */
  expandedDirs: string[];
  /** Path scoping the file browser – null means the main project root */
  selectedWorktreePath: string | null;
}

interface FileEditorActions {
  /** Open a file in a new tab (or focus it if already open) */
  openTab: (file: Omit<FileTab, 'id'>) => void;
  /** Close a tab by its ID */
  closeTab: (id: string) => void;
  /** Switch to a tab by ID */
  setActiveTab: (id: string) => void;
  /** Toggle expansion of a directory in the file tree */
  toggleDir: (relativePath: string) => void;
  /** Scope the file browser to a worktree path (null = main repo) */
  setSelectedWorktreePath: (path: string | null) => void;
}

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useFileEditorStore = create<FileEditorState & FileEditorActions>()(
  persist(
    (set, get) => ({
      openTabs: [],
      activeTabId: null,
      expandedDirs: [],
      selectedWorktreePath: null,

      openTab: (file) => {
        const existing = get().openTabs.find((t) => t.path === file.path);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const newTab: FileTab = { id: generateId(), ...file };
        set((state) => ({
          openTabs: [...state.openTabs, newTab],
          activeTabId: newTab.id,
        }));
      },

      closeTab: (id) => {
        set((state) => {
          const remaining = state.openTabs.filter((t) => t.id !== id);
          let nextActive = state.activeTabId;
          if (state.activeTabId === id) {
            const idx = state.openTabs.findIndex((t) => t.id === id);
            const next = remaining[idx] ?? remaining[idx - 1] ?? null;
            nextActive = next?.id ?? null;
          }
          return { openTabs: remaining, activeTabId: nextActive };
        });
      },

      setActiveTab: (id) => {
        set({ activeTabId: id });
      },

      toggleDir: (relativePath) => {
        set((state) => {
          const isExpanded = state.expandedDirs.includes(relativePath);
          return {
            expandedDirs: isExpanded
              ? state.expandedDirs.filter((p) => p !== relativePath)
              : [...state.expandedDirs, relativePath],
          };
        });
      },

      setSelectedWorktreePath: (path) => {
        set({ selectedWorktreePath: path });
      },
    }),
    {
      name: 'automaker-file-editor',
      version: 1,
      partialize: (state) => ({
        openTabs: state.openTabs,
        activeTabId: state.activeTabId,
        expandedDirs: state.expandedDirs,
        selectedWorktreePath: state.selectedWorktreePath,
      }),
    }
  )
);
