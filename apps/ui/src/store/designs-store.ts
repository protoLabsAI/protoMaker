import { create } from 'zustand';
import type { PenNode } from '@protolabs-ai/types';

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

export interface HistoryEntry {
  content: string;
  timestamp: number;
}

export interface DesignsState {
  // File tree state
  fileTree: FileTreeNode[];
  expandedFolders: Set<string>;

  // Selected file state
  selectedFilePath: string | null;
  selectedDocument: PenDocument | null;

  // Selection state
  selectedNodeId: string | null;

  // Dirty state
  isDirty: boolean;
  isSaving: boolean;

  // History state
  history: HistoryEntry[];
  historyIndex: number;

  // Component library state
  isLibraryVisible: boolean;
  librarySearchFilter: string;
  expandedLibraryGroups: Set<string>;

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

  // Selection actions
  selectNode: (nodeId: string | null) => void;
  setSelectedNode: (nodeId: string | null) => void;

  // Document update actions
  updateNode: (nodeId: string, updates: Partial<PenNode>) => void;
  updateDocument: (content: string, addToHistory?: boolean) => void;
  createRefNode: (targetFrameId: string, componentId: string) => void;

  // Reordering actions
  reorderChildren: (frameId: string, fromIndex: number, toIndex: number) => void;
  moveNode: (
    nodeId: string,
    sourceFrameId: string,
    targetFrameId: string,
    targetIndex: number
  ) => void;

  // History actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Save actions
  saveDocument: () => Promise<void>;
  setDirty: (dirty: boolean) => void;

  // Component library actions
  toggleLibraryVisibility: () => void;
  setLibrarySearchFilter: (filter: string) => void;
  toggleLibraryGroup: (groupName: string) => void;

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
  selectedNodeId: null,
  isDirty: false,
  isSaving: false,
  history: [],
  historyIndex: -1,
  isLibraryVisible: true,
  librarySearchFilter: '',
  expandedLibraryGroups: new Set(),
  isLoadingTree: false,
  isLoadingDocument: false,
};

// Helper to find and update a node in the tree
function updateNodeInTree(nodes: PenNode[], nodeId: string, updates: Partial<PenNode>): PenNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates };
    }
    if ('children' in node && node.children) {
      return {
        ...node,
        children: updateNodeInTree(node.children, nodeId, updates),
      };
    }
    return node;
  });
}

// Helper to reorder children within a frame
function reorderChildrenInTree(
  nodes: PenNode[],
  frameId: string,
  fromIndex: number,
  toIndex: number
): PenNode[] {
  return nodes.map((node) => {
    if (node.id === frameId && 'children' in node && node.children) {
      const children = [...node.children];
      const [movedItem] = children.splice(fromIndex, 1);
      children.splice(toIndex, 0, movedItem);
      return { ...node, children };
    }
    if ('children' in node && node.children) {
      return {
        ...node,
        children: reorderChildrenInTree(node.children, frameId, fromIndex, toIndex),
      };
    }
    return node;
  });
}

// Helper to move a node from one frame to another
function moveNodeBetweenFrames(
  nodes: PenNode[],
  nodeId: string,
  sourceFrameId: string,
  targetFrameId: string,
  targetIndex: number
): { nodes: PenNode[]; movedNode: PenNode | null } {
  let movedNode: PenNode | null = null;

  // First, remove the node from source frame
  const removeNode = (nodes: PenNode[]): PenNode[] => {
    return nodes.map((node) => {
      if (node.id === sourceFrameId && 'children' in node && node.children) {
        const children = node.children.filter((child) => {
          if (child.id === nodeId) {
            movedNode = child;
            return false;
          }
          return true;
        });
        return { ...node, children };
      }
      if ('children' in node && node.children) {
        return { ...node, children: removeNode(node.children) };
      }
      return node;
    });
  };

  // Then, insert the node into target frame
  const insertNode = (nodes: PenNode[]): PenNode[] => {
    return nodes.map((node) => {
      if (node.id === targetFrameId && 'children' in node && node.children) {
        const children = [...node.children];
        const insertIndex = Math.min(targetIndex, children.length);
        if (movedNode) {
          children.splice(insertIndex, 0, movedNode);
        }
        return { ...node, children };
      }
      if ('children' in node && node.children) {
        return { ...node, children: insertNode(node.children) };
      }
      return node;
    });
  };

  const nodesAfterRemoval = removeNode(nodes);
  const nodesAfterInsertion = insertNode(nodesAfterRemoval);

  return { nodes: nodesAfterInsertion, movedNode };
}

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
  setSelectedFile: (path, document) => {
    // Initialize history when loading a new document
    const history = document ? [{ content: document.content, timestamp: Date.now() }] : [];
    set({
      selectedFilePath: path,
      selectedDocument: document,
      selectedNodeId: null,
      isDirty: false,
      history,
      historyIndex: document ? 0 : -1,
    });
  },

  // Selection actions
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  // Document update actions
  updateNode: (nodeId, updates) => {
    const state = get();
    const { selectedDocument } = state;

    if (!selectedDocument) return;

    try {
      const parsed = JSON.parse(selectedDocument.content);
      const updatedChildren = updateNodeInTree(parsed.children || [], nodeId, updates);
      const newContent = JSON.stringify({ ...parsed, children: updatedChildren }, null, 2);

      get().updateDocument(newContent, true);
    } catch (error) {
      console.error('Failed to update node:', error);
    }
  },

  updateDocument: (content, addToHistory = true) => {
    const state = get();

    if (addToHistory) {
      // Truncate history if we're not at the end
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({ content, timestamp: Date.now() });

      // Limit history to 50 entries
      const limitedHistory = newHistory.slice(-50);

      set({
        selectedDocument: { ...state.selectedDocument!, content },
        history: limitedHistory,
        historyIndex: limitedHistory.length - 1,
        isDirty: true,
      });
    } else {
      set({
        selectedDocument: { ...state.selectedDocument!, content },
        isDirty: true,
      });
    }
  },

  // Create ref node (for drag-and-drop component instantiation)
  createRefNode: (targetFrameId, componentId) => {
    const state = get();
    const { selectedDocument } = state;

    if (!selectedDocument) return;

    try {
      const parsed = JSON.parse(selectedDocument.content);

      // Find and update the target frame recursively
      const findAndAddRef = (nodes: PenNode[]): boolean => {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node.id === targetFrameId && node.type === 'frame') {
            // Create new ref node
            const refNode = {
              id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              name: 'Instance',
              type: 'ref',
              componentId,
              children: [],
            };

            // Add to frame's children
            if (!node.children) {
              node.children = [];
            }
            node.children.push(refNode);

            return true;
          }

          // Recursively search children
          if ('children' in node && node.children) {
            if (findAndAddRef(node.children)) {
              return true;
            }
          }
        }
        return false;
      };

      const success = findAndAddRef(parsed.children || []);

      if (success) {
        const newContent = JSON.stringify(parsed, null, 2);
        get().updateDocument(newContent, true);
      }
    } catch (error) {
      console.error('Failed to create ref node:', error);
    }
  },

  // Reorder children within a frame
  reorderChildren: (frameId, fromIndex, toIndex) => {
    const state = get();
    const { selectedDocument } = state;

    if (!selectedDocument) return;

    try {
      const parsed = JSON.parse(selectedDocument.content);
      const updatedChildren = reorderChildrenInTree(
        parsed.children || [],
        frameId,
        fromIndex,
        toIndex
      );
      const newContent = JSON.stringify({ ...parsed, children: updatedChildren }, null, 2);

      get().updateDocument(newContent, true);
    } catch (error) {
      console.error('Failed to reorder children:', error);
    }
  },

  // Move node between frames
  moveNode: (nodeId, sourceFrameId, targetFrameId, targetIndex) => {
    const state = get();
    const { selectedDocument } = state;

    if (!selectedDocument) return;

    try {
      const parsed = JSON.parse(selectedDocument.content);
      const { nodes: updatedChildren, movedNode } = moveNodeBetweenFrames(
        parsed.children || [],
        nodeId,
        sourceFrameId,
        targetFrameId,
        targetIndex
      );

      if (movedNode) {
        const newContent = JSON.stringify({ ...parsed, children: updatedChildren }, null, 2);
        get().updateDocument(newContent, true);
      }
    } catch (error) {
      console.error('Failed to move node:', error);
    }
  },

  // History actions
  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      const content = state.history[newIndex].content;
      set({
        selectedDocument: { ...state.selectedDocument!, content },
        historyIndex: newIndex,
        isDirty: true,
      });
    }
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      const content = state.history[newIndex].content;
      set({
        selectedDocument: { ...state.selectedDocument!, content },
        historyIndex: newIndex,
        isDirty: true,
      });
    }
  },

  canUndo: () => {
    const state = get();
    return state.historyIndex > 0;
  },

  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },

  // Save actions
  saveDocument: async () => {
    const state = get();
    const { selectedFilePath, selectedDocument } = state;

    if (!selectedFilePath || !selectedDocument) return;

    set({ isSaving: true });

    try {
      const response = await fetch('/api/designs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: selectedFilePath,
          content: selectedDocument.content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save document');
      }

      // Reset dirty flag on successful save
      set({ isDirty: false, isSaving: false });
    } catch (error) {
      console.error('Failed to save document:', error);
      set({ isSaving: false });
      throw error;
    }
  },

  setDirty: (dirty) => set({ isDirty: dirty }),

  // Component library actions
  toggleLibraryVisibility: () => set((state) => ({ isLibraryVisible: !state.isLibraryVisible })),

  setLibrarySearchFilter: (filter) => set({ librarySearchFilter: filter }),

  toggleLibraryGroup: (groupName) => {
    const expanded = new Set(get().expandedLibraryGroups);
    if (expanded.has(groupName)) {
      expanded.delete(groupName);
    } else {
      expanded.add(groupName);
    }
    set({ expandedLibraryGroups: expanded });
  },

  // Loading state actions
  setLoadingTree: (loading) => set({ isLoadingTree: loading }),
  setLoadingDocument: (loading) => set({ isLoadingDocument: loading }),

  // Reset
  reset: () => set(initialState),
}));
