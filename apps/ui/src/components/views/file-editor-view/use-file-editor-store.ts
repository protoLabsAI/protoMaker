/**
 * File Editor Store
 *
 * Manages open file tabs, content, loading state, and tree navigation
 * for the file editor view.
 * Font family/size settings live in app-store.ts and are persisted there.
 */

import { create } from 'zustand';
import { apiPost } from '@/lib/api-fetch';

const BINARY_EXTENSIONS = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'webp',
  'tiff',
  'tif',
  'avif',
  // Archives
  'zip',
  'tar',
  'gz',
  'bz2',
  'rar',
  '7z',
  // Fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  // Native binaries
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  // Office / PDFs
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

function isBinaryFile(filePath: string): boolean {
  const parts = filePath.split('.');
  if (parts.length < 2) return false;
  const ext = parts[parts.length - 1].toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface FileEditorTab {
  id: string;
  /** Absolute file path */
  filePath: string;
  /** Display name (basename) */
  fileName: string;
  /** Current in-memory content */
  content: string;
  /** Content as last written to disk (for unsaved indicator) */
  savedContent: string;
  /** True while fetching file content from the server */
  isLoading: boolean;
  /** True if the file is a binary format that cannot be edited */
  isBinary: boolean;
  /** Error message if loading failed */
  error?: string;
}

interface FileEditorStoreState {
  tabs: FileEditorTab[];
  activeTabId: string | null;
  /** Set of relative directory paths that are expanded in the file tree */
  expandedDirs: string[];
  /** Path scoping the file browser — null means the main project root */
  selectedWorktreePath: string | null;
}

interface FileEditorStoreActions {
  /** Open a file — switches to existing tab or creates a new one */
  openFile: (filePath: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  /** Called by the code editor on every keystroke */
  updateTabContent: (tabId: string, content: string) => void;
  /** Called after a successful auto-save */
  markTabSaved: (tabId: string) => void;
  /** Reorder tabs after a drag-and-drop */
  reorderTabs: (activeId: string, overId: string) => void;
  /** Toggle expansion of a directory in the file tree */
  toggleDir: (relativePath: string) => void;
  /** Scope the file browser to a worktree path (null = main repo) */
  setSelectedWorktreePath: (path: string | null) => void;
}

export type FileEditorStore = FileEditorStoreState & FileEditorStoreActions;

export const useFileEditorStore = create<FileEditorStore>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  expandedDirs: [],
  selectedWorktreePath: null,

  openFile: async (filePath: string) => {
    const { tabs } = get();

    const existing = tabs.find((t) => t.filePath === filePath);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const tabId = generateTabId();
    const binary = isBinaryFile(filePath);

    const newTab: FileEditorTab = {
      id: tabId,
      filePath,
      fileName: getFileName(filePath),
      content: '',
      savedContent: '',
      isLoading: !binary,
      isBinary: binary,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));

    if (binary) return;

    try {
      const result = await apiPost<{ success: boolean; content?: string; error?: string }>(
        '/api/fs/read',
        { filePath }
      );

      if (result.success && result.content !== undefined) {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? { ...t, content: result.content!, savedContent: result.content!, isLoading: false }
              : t
          ),
        }));
      } else {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? { ...t, isLoading: false, error: result.error ?? 'Failed to read file' }
              : t
          ),
        }));
      }
    } catch (err) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to read file',
              }
            : t
        ),
      }));
    }
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    const remaining = tabs.filter((t) => t.id !== tabId);

    let nextActiveId: string | null = activeTabId;
    if (activeTabId === tabId) {
      nextActiveId = remaining.length === 0 ? null : remaining[Math.max(0, idx - 1)].id;
    }

    set({ tabs: remaining, activeTabId: nextActiveId });
  },

  setActiveTab: (tabId: string) => set({ activeTabId: tabId }),

  updateTabContent: (tabId: string, content: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, content } : t)),
    }));
  },

  markTabSaved: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, savedContent: t.content } : t)),
    }));
  },

  reorderTabs: (activeId: string, overId: string) => {
    const { tabs } = get();
    const fromIdx = tabs.findIndex((t) => t.id === activeId);
    const toIdx = tabs.findIndex((t) => t.id === overId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const reordered = [...tabs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    set({ tabs: reordered });
  },

  toggleDir: (relativePath: string) => {
    set((state) => {
      const isExpanded = state.expandedDirs.includes(relativePath);
      return {
        expandedDirs: isExpanded
          ? state.expandedDirs.filter((p) => p !== relativePath)
          : [...state.expandedDirs, relativePath],
      };
    });
  },

  setSelectedWorktreePath: (path: string | null) => {
    set({ selectedWorktreePath: path });
  },
}));
