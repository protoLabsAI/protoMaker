/**
 * UI Cache Store
 *
 * Persists critical UI state to localStorage for instant restoration on app load.
 * This provides a better UX by showing the last known state before the server responds.
 *
 * Includes:
 * - Current project path
 * - Sidebar open/closed state
 * - Active board column order
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UICacheState {
  // Project state
  currentProjectPath: string | null;
  setCurrentProjectPath: (path: string | null) => void;

  // Sidebar state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Board column order (per project)
  columnOrderByProject: Record<string, string[]>;
  setColumnOrder: (projectPath: string, columnIds: string[]) => void;
  getColumnOrder: (projectPath: string) => string[] | undefined;
}

/**
 * UI Cache Store
 *
 * Persisted to localStorage for instant restoration on app load.
 * Read from this store immediately on app load before the server responds.
 */
export const useUICacheStore = create<UICacheState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentProjectPath: null,
      sidebarOpen: true,
      columnOrderByProject: {},

      // Actions
      setCurrentProjectPath: (path) => set({ currentProjectPath: path }),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setColumnOrder: (projectPath, columnIds) =>
        set((state) => ({
          columnOrderByProject: {
            ...state.columnOrderByProject,
            [projectPath]: columnIds,
          },
        })),

      getColumnOrder: (projectPath) => {
        return get().columnOrderByProject[projectPath];
      },
    }),
    {
      name: 'automaker-ui-cache',
      // Persist to localStorage for instant reads on app load
      // This survives browser restarts and provides offline-first UX
    }
  )
);
