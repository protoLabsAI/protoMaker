import { useState, useCallback, useEffect, useMemo } from 'react';
import { getJSON, setJSON } from '@/lib/storage';
import type { ViewMode } from '../components/view-toggle';

// Re-export ViewMode for convenience
export type { ViewMode };

/** Columns that can be sorted in the list view */
export type SortColumn = 'title' | 'status' | 'category' | 'priority' | 'createdAt' | 'updatedAt';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Sort configuration */
export interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

/** Persisted state for the list view */
interface ListViewPersistedState {
  viewMode: ViewMode;
  sortConfig: SortConfig;
}

/** Storage key for list view preferences */
const STORAGE_KEY = 'automaker:list-view-state';

/** Default sort configuration */
const DEFAULT_SORT_CONFIG: SortConfig = {
  column: 'createdAt',
  direction: 'desc',
};

/** Default persisted state */
const DEFAULT_STATE: ListViewPersistedState = {
  viewMode: 'kanban',
  sortConfig: DEFAULT_SORT_CONFIG,
};

/**
 * Validates and returns a valid ViewMode, defaulting to 'kanban' if invalid
 */
function validateViewMode(value: unknown): ViewMode {
  if (value === 'kanban' || value === 'list') {
    return value;
  }
  return 'kanban';
}

/**
 * Validates and returns a valid SortColumn, defaulting to 'createdAt' if invalid
 */
function validateSortColumn(value: unknown): SortColumn {
  const validColumns: SortColumn[] = [
    'title',
    'status',
    'category',
    'priority',
    'createdAt',
    'updatedAt',
  ];
  if (typeof value === 'string' && validColumns.includes(value as SortColumn)) {
    return value as SortColumn;
  }
  return 'createdAt';
}

/**
 * Validates and returns a valid SortDirection, defaulting to 'desc' if invalid
 */
function validateSortDirection(value: unknown): SortDirection {
  if (value === 'asc' || value === 'desc') {
    return value;
  }
  return 'desc';
}

/**
 * Load persisted state from localStorage with validation
 */
function loadPersistedState(): ListViewPersistedState {
  const stored = getJSON<Partial<ListViewPersistedState>>(STORAGE_KEY);

  if (!stored) {
    return DEFAULT_STATE;
  }

  return {
    viewMode: validateViewMode(stored.viewMode),
    sortConfig: {
      column: validateSortColumn(stored.sortConfig?.column),
      direction: validateSortDirection(stored.sortConfig?.direction),
    },
  };
}

/**
 * Save state to localStorage
 */
function savePersistedState(state: ListViewPersistedState): void {
  setJSON(STORAGE_KEY, state);
}

export interface UseListViewStateReturn {
  /** Current view mode (kanban or list) */
  viewMode: ViewMode;
  /** Set the view mode */
  setViewMode: (mode: ViewMode) => void;
  /** Toggle between kanban and list views */
  toggleViewMode: () => void;
  /** Whether the current view is list mode */
  isListView: boolean;
  /** Whether the current view is kanban mode */
  isKanbanView: boolean;
  /** Current sort configuration */
  sortConfig: SortConfig;
  /** Set the sort column (toggles direction if same column) */
  setSortColumn: (column: SortColumn) => void;
  /** Set the full sort configuration */
  setSortConfig: (config: SortConfig) => void;
  /** Reset sort to default */
  resetSort: () => void;
}

/**
 * Hook for managing list view state including view mode, sorting, and localStorage persistence.
 *
 * Features:
 * - View mode toggle between kanban and list views
 * - Sort configuration with column and direction
 * - Automatic persistence to localStorage
 * - Validated state restoration on mount
 *
 * @example
 * ```tsx
 * const { viewMode, setViewMode, sortConfig, setSortColumn } = useListViewState();
 *
 * // Toggle view mode
 * <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
 *
 * // Sort by column (clicking same column toggles direction)
 * <TableHeader onClick={() => setSortColumn('title')}>Title</TableHeader>
 * ```
 */
export function useListViewState(): UseListViewStateReturn {
  // Initialize state from localStorage
  const [viewMode, setViewModeState] = useState<ViewMode>(() => loadPersistedState().viewMode);
  const [sortConfig, setSortConfigState] = useState<SortConfig>(
    () => loadPersistedState().sortConfig
  );

  // Derived state
  const isListView = viewMode === 'list';
  const isKanbanView = viewMode === 'kanban';

  // Persist state changes to localStorage
  useEffect(() => {
    savePersistedState({ viewMode, sortConfig });
  }, [viewMode, sortConfig]);

  // Set view mode
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
  }, []);

  // Toggle between kanban and list views
  const toggleViewMode = useCallback(() => {
    setViewModeState((prev) => (prev === 'kanban' ? 'list' : 'kanban'));
  }, []);

  // Set sort column - toggles direction if same column is clicked
  const setSortColumn = useCallback((column: SortColumn) => {
    setSortConfigState((prev) => {
      if (prev.column === column) {
        // Toggle direction if same column
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      // New column - default to descending for dates, ascending for others
      const defaultDirection: SortDirection =
        column === 'createdAt' || column === 'updatedAt' ? 'desc' : 'asc';
      return { column, direction: defaultDirection };
    });
  }, []);

  // Set full sort configuration
  const setSortConfig = useCallback((config: SortConfig) => {
    setSortConfigState(config);
  }, []);

  // Reset sort to default
  const resetSort = useCallback(() => {
    setSortConfigState(DEFAULT_SORT_CONFIG);
  }, []);

  return useMemo(
    () => ({
      viewMode,
      setViewMode,
      toggleViewMode,
      isListView,
      isKanbanView,
      sortConfig,
      setSortColumn,
      setSortConfig,
      resetSort,
    }),
    [
      viewMode,
      setViewMode,
      toggleViewMode,
      isListView,
      isKanbanView,
      sortConfig,
      setSortColumn,
      setSortConfig,
      resetSort,
    ]
  );
}
