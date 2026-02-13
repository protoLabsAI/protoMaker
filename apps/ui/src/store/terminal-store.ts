/**
 * Terminal Store - State management for integrated terminal
 */

import { create } from 'zustand';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';

// ============================================================================
// Types
// ============================================================================

export type TerminalPanelContent =
  | { type: 'terminal'; sessionId: string; size?: number; fontSize?: number; branchName?: string }
  | {
      type: 'split';
      id: string; // Stable ID for React key stability
      direction: 'horizontal' | 'vertical';
      panels: TerminalPanelContent[];
      size?: number;
    };

// Terminal tab - each tab has its own layout
export interface TerminalTab {
  id: string;
  name: string;
  layout: TerminalPanelContent | null;
}

export interface TerminalState {
  isUnlocked: boolean;
  authToken: string | null;
  tabs: TerminalTab[];
  activeTabId: string | null;
  activeSessionId: string | null;
  maximizedSessionId: string | null; // Session ID of the maximized terminal pane (null if none)
  defaultFontSize: number; // Default font size for new terminals
  defaultRunScript: string; // Script to run when a new terminal is created (e.g., "claude" to start Claude Code)
  screenReaderMode: boolean; // Enable screen reader accessibility mode
  fontFamily: string; // Font family for terminal text
  scrollbackLines: number; // Number of lines to keep in scrollback buffer
  lineHeight: number; // Line height multiplier for terminal text
  maxSessions: number; // Maximum concurrent terminal sessions (server setting)
  lastActiveProjectPath: string | null; // Last project path to detect route changes vs project switches
  openTerminalMode: 'newTab' | 'split'; // How to open terminals from "Open in Terminal" action
}

// Persisted terminal layout - now includes sessionIds for reconnection
// Used to restore terminal layout structure when switching projects
export type PersistedTerminalPanel =
  | { type: 'terminal'; size?: number; fontSize?: number; sessionId?: string; branchName?: string }
  | {
      type: 'split';
      id?: string; // Optional for backwards compatibility with older persisted layouts
      direction: 'horizontal' | 'vertical';
      panels: PersistedTerminalPanel[];
      size?: number;
    };

// Helper to generate unique split IDs
const generateSplitId = () => `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface PersistedTerminalTab {
  id: string;
  name: string;
  layout: PersistedTerminalPanel | null;
}

export interface PersistedTerminalState {
  tabs: PersistedTerminalTab[];
  activeTabIndex: number; // Use index instead of ID since IDs are regenerated
  defaultFontSize: number;
  defaultRunScript?: string; // Optional to support existing persisted data
  screenReaderMode?: boolean; // Optional to support existing persisted data
  fontFamily?: string; // Optional to support existing persisted data
  scrollbackLines?: number; // Optional to support existing persisted data
  lineHeight?: number; // Optional to support existing persisted data
}

// Persisted terminal settings - stored globally (not per-project)
export interface PersistedTerminalSettings {
  defaultFontSize: number;
  defaultRunScript: string;
  screenReaderMode: boolean;
  fontFamily: string;
  scrollbackLines: number;
  lineHeight: number;
  maxSessions: number;
  openTerminalMode: 'newTab' | 'split';
}

// ============================================================================
// State Interface
// ============================================================================

interface TerminalStoreState {
  terminalState: TerminalState;
  // Terminal layout persistence (per-project, keyed by project path)
  // Stores the tab/split structure so it can be restored when switching projects
  terminalLayoutByProject: Record<string, PersistedTerminalState>;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface TerminalActions {
  setTerminalUnlocked: (unlocked: boolean, token?: string) => void;
  setActiveTerminalSession: (sessionId: string | null) => void;
  toggleTerminalMaximized: (sessionId: string) => void;
  addTerminalToLayout: (
    sessionId: string,
    direction?: 'horizontal' | 'vertical',
    targetSessionId?: string,
    branchName?: string
  ) => void;
  removeTerminalFromLayout: (sessionId: string) => void;
  clearTerminalState: (keepAuth?: boolean) => void;
  setTerminalPanelFontSize: (sessionId: string, fontSize: number) => void;
  setTerminalDefaultFontSize: (fontSize: number) => void;
  setTerminalDefaultRunScript: (script: string) => void;
  setTerminalScreenReaderMode: (enabled: boolean) => void;
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalScrollbackLines: (lines: number) => void;
  setTerminalLineHeight: (lineHeight: number) => void;
  setTerminalMaxSessions: (maxSessions: number) => void;
  setTerminalLastActiveProjectPath: (projectPath: string | null) => void;
  setOpenTerminalMode: (mode: 'newTab' | 'split') => void;
  addTerminalTab: (name?: string) => string;
  removeTerminalTab: (tabId: string) => void;
  setActiveTerminalTab: (tabId: string) => void;
  renameTerminalTab: (tabId: string, newName: string) => void;
  reorderTerminalTabs: (oldIndex: number, newIndex: number) => void;
  moveTerminalToTab: (sessionId: string, targetTabId: string) => void;
  addTerminalToTab: (
    sessionId: string,
    tabId: string,
    direction?: 'horizontal' | 'vertical',
    branchName?: string
  ) => void;
  setTerminalTabLayout: (
    tabId: string,
    layout: TerminalPanelContent | null,
    activeSessionId?: string | null
  ) => void;
  updateTerminalPanelSizes: (tabId: string, panelKeys: string[], sizes: number[]) => void;
  saveTerminalLayout: (projectPath: string) => void;
  getPersistedTerminalLayout: (projectPath: string) => PersistedTerminalState | undefined;
  clearPersistedTerminalLayout: (projectPath: string) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: TerminalStoreState = {
  terminalState: {
    isUnlocked: false,
    authToken: null,
    tabs: [],
    activeTabId: null,
    activeSessionId: null,
    maximizedSessionId: null,
    defaultFontSize: 14,
    defaultRunScript: '',
    screenReaderMode: false,
    fontFamily: DEFAULT_FONT_VALUE,
    scrollbackLines: 5000,
    lineHeight: 1.0,
    maxSessions: 100,
    lastActiveProjectPath: null,
    openTerminalMode: 'newTab',
  },
  terminalLayoutByProject: {},
};

// ============================================================================
// Store
// ============================================================================

export const useTerminalStore = create<TerminalStoreState & TerminalActions>((set, get) => ({
  ...initialState,

  setTerminalUnlocked: (unlocked, token) => {
    set({
      terminalState: {
        ...get().terminalState,
        isUnlocked: unlocked,
        authToken: token || null,
      },
    });
  },

  setActiveTerminalSession: (sessionId) => {
    set({
      terminalState: {
        ...get().terminalState,
        activeSessionId: sessionId,
      },
    });
  },

  toggleTerminalMaximized: (sessionId) => {
    const current = get().terminalState;
    const newMaximized = current.maximizedSessionId === sessionId ? null : sessionId;
    set({
      terminalState: {
        ...current,
        maximizedSessionId: newMaximized,
        // Also set as active when maximizing
        activeSessionId: newMaximized ?? current.activeSessionId,
      },
    });
  },

  addTerminalToLayout: (sessionId, direction = 'horizontal', targetSessionId, branchName) => {
    const current = get().terminalState;
    const newTerminal: TerminalPanelContent = {
      type: 'terminal',
      sessionId,
      size: 50,
      branchName,
    };

    // If no tabs, create first tab
    if (current.tabs.length === 0) {
      const newTabId = `tab-${Date.now()}`;
      set({
        terminalState: {
          ...current,
          tabs: [
            {
              id: newTabId,
              name: 'Terminal 1',
              layout: { type: 'terminal', sessionId, size: 100, branchName },
            },
          ],
          activeTabId: newTabId,
          activeSessionId: sessionId,
        },
      });
      return;
    }

    // Add to active tab's layout
    const activeTab = current.tabs.find((t) => t.id === current.activeTabId);
    if (!activeTab) return;

    // If targetSessionId is provided, find and split that specific terminal
    const splitTargetTerminal = (
      node: TerminalPanelContent,
      targetId: string,
      targetDirection: 'horizontal' | 'vertical'
    ): TerminalPanelContent => {
      if (node.type === 'terminal') {
        if (node.sessionId === targetId) {
          // Found the target - split it
          return {
            type: 'split',
            id: generateSplitId(),
            direction: targetDirection,
            panels: [{ ...node, size: 50 }, newTerminal],
          };
        }
        // Not the target, return unchanged
        return node;
      }
      // It's a split - recurse into panels
      return {
        ...node,
        panels: node.panels.map((p) => splitTargetTerminal(p, targetId, targetDirection)),
      };
    };

    // Legacy behavior: add to root layout (when no targetSessionId)
    const addToRootLayout = (
      node: TerminalPanelContent,
      targetDirection: 'horizontal' | 'vertical'
    ): TerminalPanelContent => {
      if (node.type === 'terminal') {
        return {
          type: 'split',
          id: generateSplitId(),
          direction: targetDirection,
          panels: [{ ...node, size: 50 }, newTerminal],
        };
      }
      // If same direction, add to existing split
      if (node.direction === targetDirection) {
        const newSize = 100 / (node.panels.length + 1);
        return {
          ...node,
          panels: [
            ...node.panels.map((p) => ({ ...p, size: newSize })),
            { ...newTerminal, size: newSize },
          ],
        };
      }
      // Different direction, wrap in new split
      return {
        type: 'split',
        id: generateSplitId(),
        direction: targetDirection,
        panels: [{ ...node, size: 50 }, newTerminal],
      };
    };

    let newLayout: TerminalPanelContent;
    if (!activeTab.layout) {
      newLayout = { type: 'terminal', sessionId, size: 100, branchName };
    } else if (targetSessionId) {
      newLayout = splitTargetTerminal(activeTab.layout, targetSessionId, direction);
    } else {
      newLayout = addToRootLayout(activeTab.layout, direction);
    }

    const newTabs = current.tabs.map((t) =>
      t.id === current.activeTabId ? { ...t, layout: newLayout } : t
    );

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeSessionId: sessionId,
      },
    });
  },

  removeTerminalFromLayout: (sessionId) => {
    const current = get().terminalState;
    if (current.tabs.length === 0) return;

    // Find which tab contains this session
    const findFirstTerminal = (node: TerminalPanelContent | null): string | null => {
      if (!node) return null;
      if (node.type === 'terminal') return node.sessionId;
      for (const panel of node.panels) {
        const found = findFirstTerminal(panel);
        if (found) return found;
      }
      return null;
    };

    const removeAndCollapse = (node: TerminalPanelContent): TerminalPanelContent | null => {
      if (node.type === 'terminal') {
        return node.sessionId === sessionId ? null : node;
      }
      const newPanels: TerminalPanelContent[] = [];
      for (const panel of node.panels) {
        const result = removeAndCollapse(panel);
        if (result !== null) newPanels.push(result);
      }
      if (newPanels.length === 0) return null;
      if (newPanels.length === 1) return newPanels[0];
      // Normalize sizes to sum to 100%
      const totalSize = newPanels.reduce((sum, p) => sum + (p.size || 0), 0);
      const normalizedPanels =
        totalSize > 0
          ? newPanels.map((p) => ({ ...p, size: ((p.size || 0) / totalSize) * 100 }))
          : newPanels.map((p) => ({ ...p, size: 100 / newPanels.length }));
      return { ...node, panels: normalizedPanels };
    };

    let newTabs = current.tabs.map((tab) => {
      if (!tab.layout) return tab;
      const newLayout = removeAndCollapse(tab.layout);
      return { ...tab, layout: newLayout };
    });

    // Remove empty tabs
    newTabs = newTabs.filter((tab) => tab.layout !== null);

    // Determine new active session
    const newActiveTabId =
      newTabs.length > 0
        ? current.activeTabId && newTabs.find((t) => t.id === current.activeTabId)
          ? current.activeTabId
          : newTabs[0].id
        : null;
    const newActiveSessionId = newActiveTabId
      ? findFirstTerminal(newTabs.find((t) => t.id === newActiveTabId)?.layout || null)
      : null;

    // Clear maximized if it was the removed session
    const newMaximizedSessionId =
      current.maximizedSessionId === sessionId ? null : current.maximizedSessionId;

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeTabId: newActiveTabId,
        activeSessionId: newActiveSessionId,
        maximizedSessionId: newMaximizedSessionId,
      },
    });
  },

  clearTerminalState: (keepAuth = false) => {
    const current = get().terminalState;
    set({
      terminalState: {
        ...current,
        isUnlocked: keepAuth ? current.isUnlocked : false,
        authToken: keepAuth ? current.authToken : null,
        tabs: [],
        activeTabId: null,
        activeSessionId: null,
        maximizedSessionId: null,
      },
    });
  },

  setTerminalPanelFontSize: (sessionId, fontSize) => {
    const current = get().terminalState;
    const updateFontSize = (node: TerminalPanelContent): TerminalPanelContent => {
      if (node.type === 'terminal') {
        return node.sessionId === sessionId ? { ...node, fontSize } : node;
      }
      return { ...node, panels: node.panels.map(updateFontSize) };
    };

    const newTabs = current.tabs.map((tab) =>
      tab.layout ? { ...tab, layout: updateFontSize(tab.layout) } : tab
    );

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
      },
    });
  },

  setTerminalDefaultFontSize: (fontSize) => {
    set({
      terminalState: {
        ...get().terminalState,
        defaultFontSize: fontSize,
      },
    });
  },

  setTerminalDefaultRunScript: (script) => {
    set({
      terminalState: {
        ...get().terminalState,
        defaultRunScript: script,
      },
    });
  },

  setTerminalScreenReaderMode: (enabled) => {
    set({
      terminalState: {
        ...get().terminalState,
        screenReaderMode: enabled,
      },
    });
  },

  setTerminalFontFamily: (fontFamily) => {
    set({
      terminalState: {
        ...get().terminalState,
        fontFamily,
      },
    });
  },

  setTerminalScrollbackLines: (lines) => {
    // Clamp to reasonable values (1000-50000)
    const clampedLines = Math.max(1000, Math.min(50000, lines));
    set({
      terminalState: {
        ...get().terminalState,
        scrollbackLines: clampedLines,
      },
    });
  },

  setTerminalLineHeight: (lineHeight) => {
    // Clamp to reasonable values (0.5-2.0)
    const clampedLineHeight = Math.max(0.5, Math.min(2.0, lineHeight));
    set({
      terminalState: {
        ...get().terminalState,
        lineHeight: clampedLineHeight,
      },
    });
  },

  setTerminalMaxSessions: (maxSessions) => {
    set({
      terminalState: {
        ...get().terminalState,
        maxSessions,
      },
    });
  },

  setTerminalLastActiveProjectPath: (projectPath) => {
    set({
      terminalState: {
        ...get().terminalState,
        lastActiveProjectPath: projectPath,
      },
    });
  },

  setOpenTerminalMode: (mode) => {
    set({
      terminalState: {
        ...get().terminalState,
        openTerminalMode: mode,
      },
    });
  },

  addTerminalTab: (name) => {
    const current = get().terminalState;
    const tabCount = current.tabs.length;
    const newTabId = `tab-${Date.now()}`;
    const tabName = name || `Terminal ${tabCount + 1}`;

    set({
      terminalState: {
        ...current,
        tabs: [
          ...current.tabs,
          {
            id: newTabId,
            name: tabName,
            layout: null,
          },
        ],
        activeTabId: newTabId,
      },
    });

    return newTabId;
  },

  removeTerminalTab: (tabId) => {
    const current = get().terminalState;
    const tabIndex = current.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const newTabs = current.tabs.filter((t) => t.id !== tabId);
    let newActiveTabId = current.activeTabId;
    let newActiveSessionId = current.activeSessionId;

    // If we're removing the active tab, switch to another tab
    if (current.activeTabId === tabId && newTabs.length > 0) {
      // Try to activate the next tab, or fall back to the previous one
      const nextTab = newTabs[Math.min(tabIndex, newTabs.length - 1)];
      newActiveTabId = nextTab.id;

      // Find the first terminal in the new active tab
      const findFirstTerminal = (node: TerminalPanelContent | null): string | null => {
        if (!node) return null;
        if (node.type === 'terminal') return node.sessionId;
        for (const panel of node.panels) {
          const found = findFirstTerminal(panel);
          if (found) return found;
        }
        return null;
      };
      newActiveSessionId = findFirstTerminal(nextTab.layout);
    } else if (newTabs.length === 0) {
      newActiveTabId = null;
      newActiveSessionId = null;
    }

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeTabId: newActiveTabId,
        activeSessionId: newActiveSessionId,
      },
    });
  },

  setActiveTerminalTab: (tabId) => {
    const current = get().terminalState;
    const tab = current.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Find the first terminal in this tab to set as active
    const findFirstTerminal = (node: TerminalPanelContent | null): string | null => {
      if (!node) return null;
      if (node.type === 'terminal') return node.sessionId;
      for (const panel of node.panels) {
        const found = findFirstTerminal(panel);
        if (found) return found;
      }
      return null;
    };

    const newActiveSessionId = findFirstTerminal(tab.layout);

    set({
      terminalState: {
        ...current,
        activeTabId: tabId,
        activeSessionId: newActiveSessionId,
      },
    });
  },

  renameTerminalTab: (tabId, newName) => {
    const current = get().terminalState;
    set({
      terminalState: {
        ...current,
        tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, name: newName } : tab)),
      },
    });
  },

  reorderTerminalTabs: (oldIndex, newIndex) => {
    const current = get().terminalState;
    const newTabs = [...current.tabs];
    const [movedTab] = newTabs.splice(oldIndex, 1);
    newTabs.splice(newIndex, 0, movedTab);

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
      },
    });
  },

  moveTerminalToTab: (sessionId, targetTabId) => {
    const current = get().terminalState;

    // Find the terminal panel in the current layout
    const findAndRemove = (
      node: TerminalPanelContent,
      targetSessionId: string
    ): {
      found: TerminalPanelContent | null;
      remaining: TerminalPanelContent | null;
    } => {
      if (node.type === 'terminal') {
        if (node.sessionId === targetSessionId) {
          return { found: node, remaining: null };
        }
        return { found: null, remaining: node };
      }

      const results = node.panels.map((p) => findAndRemove(p, targetSessionId));
      const found = results.find((r) => r.found !== null);

      if (found) {
        const remainingPanels = results
          .map((r) => r.remaining)
          .filter((r): r is TerminalPanelContent => r !== null);

        if (remainingPanels.length === 0) {
          return { found: found.found, remaining: null };
        }
        if (remainingPanels.length === 1) {
          return { found: found.found, remaining: remainingPanels[0] };
        }

        return {
          found: found.found,
          remaining: { ...node, panels: remainingPanels },
        };
      }

      return { found: null, remaining: node };
    };

    let terminalPanel: TerminalPanelContent | null = null;
    const newTabs = current.tabs.map((tab) => {
      if (!tab.layout) return tab;

      const result = findAndRemove(tab.layout, sessionId);
      if (result.found) {
        terminalPanel = result.found;
      }

      return { ...tab, layout: result.remaining };
    });

    if (!terminalPanel) return; // Terminal not found

    // Add the terminal to the target tab
    const finalTabs = newTabs.map((tab) => {
      if (tab.id !== targetTabId) return tab;

      if (!tab.layout) {
        return { ...tab, layout: terminalPanel };
      }

      // Add to the tab's layout (default horizontal split)
      const newLayout: TerminalPanelContent = {
        type: 'split',
        id: generateSplitId(),
        direction: 'horizontal',
        panels: [tab.layout, terminalPanel as TerminalPanelContent],
      };

      return { ...tab, layout: newLayout };
    });

    set({
      terminalState: {
        ...current,
        tabs: finalTabs.filter((tab) => tab.layout !== null),
        activeTabId: targetTabId,
        activeSessionId: sessionId,
      },
    });
  },

  addTerminalToTab: (sessionId, tabId, direction = 'horizontal', branchName) => {
    const current = get().terminalState;
    const tab = current.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const newTerminal: TerminalPanelContent = {
      type: 'terminal',
      sessionId,
      size: 50,
      branchName,
    };

    let newLayout: TerminalPanelContent;
    if (!tab.layout) {
      newLayout = { type: 'terminal', sessionId, size: 100, branchName };
    } else if (tab.layout.type === 'terminal') {
      newLayout = {
        type: 'split',
        id: generateSplitId(),
        direction,
        panels: [{ ...tab.layout, size: 50 }, newTerminal],
      };
    } else if (tab.layout.direction === direction) {
      const newSize = 100 / (tab.layout.panels.length + 1);
      newLayout = {
        ...tab.layout,
        panels: [
          ...tab.layout.panels.map((p) => ({ ...p, size: newSize })),
          { ...newTerminal, size: newSize },
        ],
      };
    } else {
      newLayout = {
        type: 'split',
        id: generateSplitId(),
        direction,
        panels: [{ ...tab.layout, size: 50 }, newTerminal],
      };
    }

    set({
      terminalState: {
        ...current,
        tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, layout: newLayout } : t)),
        activeTabId: tabId,
        activeSessionId: sessionId,
      },
    });
  },

  setTerminalTabLayout: (tabId, layout, activeSessionId) => {
    const current = get().terminalState;
    const newTabs = current.tabs.map((tab) => (tab.id === tabId ? { ...tab, layout } : tab));

    // Find first terminal if activeSessionId not provided
    const findFirstTerminal = (node: TerminalPanelContent | null): string | null => {
      if (!node) return null;
      if (node.type === 'terminal') return node.sessionId;
      for (const panel of node.panels) {
        const found = findFirstTerminal(panel);
        if (found) return found;
      }
      return null;
    };

    const newActiveSessionId =
      activeSessionId !== undefined
        ? activeSessionId
        : tabId === current.activeTabId
          ? findFirstTerminal(layout)
          : current.activeSessionId;

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeSessionId: newActiveSessionId,
      },
    });
  },

  updateTerminalPanelSizes: (tabId, panelKeys, sizes) => {
    const current = get().terminalState;
    const tab = current.tabs.find((t) => t.id === tabId);
    if (!tab || !tab.layout) return;

    const updateSizes = (node: TerminalPanelContent, path: string): TerminalPanelContent => {
      const currentKey =
        node.type === 'terminal' ? `terminal-${node.sessionId}` : `split-${node.id}`;

      const pathWithCurrent = path ? `${path}.${currentKey}` : currentKey;

      // Check if this node's size should be updated
      const sizeIndex = panelKeys.indexOf(pathWithCurrent);
      if (sizeIndex !== -1) {
        return { ...node, size: sizes[sizeIndex] };
      }

      // Recurse for splits
      if (node.type === 'split') {
        return {
          ...node,
          panels: node.panels.map((panel) => updateSizes(panel, pathWithCurrent)),
        };
      }

      return node;
    };

    const newLayout = updateSizes(tab.layout, '');

    set({
      terminalState: {
        ...current,
        tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, layout: newLayout } : t)),
      },
    });
  },

  saveTerminalLayout: (projectPath) => {
    const current = get().terminalState;

    // Convert runtime layout to persisted format (strip sessionIds from active terminals)
    const convertToPersistedPanel = (node: TerminalPanelContent): PersistedTerminalPanel => {
      if (node.type === 'terminal') {
        return {
          type: 'terminal',
          size: node.size,
          fontSize: node.fontSize,
          sessionId: node.sessionId, // Keep sessionId for reconnection
          branchName: node.branchName,
        };
      }
      return {
        type: 'split',
        id: node.id,
        direction: node.direction,
        panels: node.panels.map(convertToPersistedPanel),
        size: node.size,
      };
    };

    const persistedTabs: PersistedTerminalTab[] = current.tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      layout: tab.layout ? convertToPersistedPanel(tab.layout) : null,
    }));

    const activeTabIndex = current.activeTabId
      ? current.tabs.findIndex((t) => t.id === current.activeTabId)
      : 0;

    const persistedState: PersistedTerminalState = {
      tabs: persistedTabs,
      activeTabIndex: Math.max(0, activeTabIndex),
      defaultFontSize: current.defaultFontSize,
      defaultRunScript: current.defaultRunScript,
      screenReaderMode: current.screenReaderMode,
      fontFamily: current.fontFamily,
      scrollbackLines: current.scrollbackLines,
      lineHeight: current.lineHeight,
    };

    set({
      terminalLayoutByProject: {
        ...get().terminalLayoutByProject,
        [projectPath]: persistedState,
      },
    });
  },

  getPersistedTerminalLayout: (projectPath) => {
    return get().terminalLayoutByProject[projectPath];
  },

  clearPersistedTerminalLayout: (projectPath) => {
    const layouts = { ...get().terminalLayoutByProject };
    delete layouts[projectPath];
    set({ terminalLayoutByProject: layouts });
  },
}));
