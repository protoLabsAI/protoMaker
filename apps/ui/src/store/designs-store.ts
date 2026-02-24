import { create } from 'zustand';

// Temporary type definitions - will be replaced when server types are available
export interface PenDocument {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

export interface DesignsState {
  // File tree state
  fileTree: FileTreeNode[];
  expandedFolders: Set<string>;

  // Selected file state
  selectedFilePath: string | null;
  selectedDocument: PenDocument | null;

  // Loading states
  isLoadingTree: boolean;
  isLoadingDocument: boolean;
}

export interface DesignsActions {
  // File tree actions
  setFileTree: (tree: FileTreeNode[]) => void;
  toggleFolder: (path: string) => void;
  expandFolder: (path: string) => void;
  collapseFolder: (path: string) => void;

  // Selected file actions
  setSelectedFile: (path: string | null, document: PenDocument | null) => void;

  // Loading state actions
  setLoadingTree: (loading: boolean) => void;
  setLoadingDocument: (loading: boolean) => void;

  // Reset
  reset: () => void;
}

const initialState: DesignsState = {
  fileTree: [],
  expandedFolders: new Set(),
  selectedFilePath: null,
  selectedDocument: null,
  isLoadingTree: false,
  isLoadingDocument: false,
};

export const useDesignsStore = create<DesignsState & DesignsActions>()((set, get) => ({
  ...initialState,

  // File tree actions
  setFileTree: (tree) => set({ fileTree: tree }),

  toggleFolder: (path) => {
    const expanded = new Set(get().expandedFolders);
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    set({ expandedFolders: expanded });
  },

  expandFolder: (path) => {
    const expanded = new Set(get().expandedFolders);
    expanded.add(path);
    set({ expandedFolders: expanded });
  },

  collapseFolder: (path) => {
    const expanded = new Set(get().expandedFolders);
    expanded.delete(path);
    set({ expandedFolders: expanded });
  },

  // Selected file actions
  setSelectedFile: (path, document) =>
    set({
      selectedFilePath: path,
      selectedDocument: document,
    }),

  // Loading state actions
  setLoadingTree: (loading) => set({ isLoadingTree: loading }),
  setLoadingDocument: (loading) => set({ isLoadingDocument: loading }),

  // Reset
  reset: () => set(initialState),
}));
