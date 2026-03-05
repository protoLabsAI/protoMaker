/**
 * Terminal Store — Zustand store owning all terminal-related state and actions.
 *
 * Extracted from app-store.ts so the terminal subsystem has a single,
 * self-contained module that is easier to reason about and test independently.
 */

import { create } from 'zustand';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import type {
  TerminalPanelContent,
  TerminalTab,
  TerminalState,
  PersistedTerminalPanel,
  PersistedTerminalTab,
  PersistedTerminalState,
  InitScriptState,
} from './types';
import { MAX_INIT_OUTPUT_LINES } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a stable, unique ID for split nodes (used as React keys). */
const generateSplitId = () => `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Request to open a terminal with a specific working directory (e.g. from worktree panel). */
export interface PendingTerminalRequest {
  cwd: string;
  branch?: string;
  mode?: 'tab' | 'split';
  nonce: number;
}

export interface TerminalStoreState {
  /** Core terminal runtime state (auth, tabs, layout, preferences). */
  terminalState: TerminalState;

  /** Per-project persisted terminal layouts, keyed by project path. */
  terminalLayoutByProject: Record<string, PersistedTerminalState>;

  /** Default external terminal ID for "Open In Terminal" action (null = integrated). */
  defaultTerminalId: string | null;

  /** Per-project init-script execution state, keyed by "projectPath::branch". */
  initScriptState: Record<string, InitScriptState>;

  /** Per-project visibility of the floating init-script indicator panel. */
  showInitScriptIndicatorByProject: Record<string, boolean>;

  /** Per-project auto-dismiss preference for the init-script indicator. */
  autoDismissInitScriptIndicatorByProject: Record<string, boolean>;

  /** Pending request to open a terminal with a specific cwd (consumed by TerminalView). */
  pendingTerminalRequest: PendingTerminalRequest | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface TerminalStoreActions {
  // Terminal configuration
  setDefaultTerminalId: (terminalId: string | null) => void;

  // Terminal auth & session
  setTerminalUnlocked: (unlocked: boolean, token?: string) => void;
  setActiveTerminalSession: (sessionId: string | null) => void;
  toggleTerminalMaximized: (sessionId: string) => void;

  // Terminal layout manipulation
  addTerminalToLayout: (
    sessionId: string,
    direction?: 'horizontal' | 'vertical',
    targetSessionId?: string,
    branchName?: string
  ) => void;
  removeTerminalFromLayout: (sessionId: string) => void;
  swapTerminals: (sessionId1: string, sessionId2: string) => void;
  clearTerminalState: () => void;

  // Terminal panel settings
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

  // Tab management
  addTerminalTab: (name?: string) => string;
  removeTerminalTab: (tabId: string) => void;
  setActiveTerminalTab: (tabId: string) => void;
  renameTerminalTab: (tabId: string, name: string) => void;
  reorderTerminalTabs: (fromTabId: string, toTabId: string) => void;
  moveTerminalToTab: (sessionId: string, targetTabId: string | 'new') => void;
  addTerminalToTab: (
    sessionId: string,
    tabId: string,
    direction?: 'horizontal' | 'vertical',
    branchName?: string
  ) => void;
  setTerminalTabLayout: (
    tabId: string,
    layout: TerminalPanelContent,
    activeSessionId?: string
  ) => void;
  updateTerminalPanelSizes: (tabId: string, panelKeys: string[], sizes: number[]) => void;

  // Layout persistence
  saveTerminalLayout: (projectPath: string) => void;
  getPersistedTerminalLayout: (projectPath: string) => PersistedTerminalState | null;
  clearPersistedTerminalLayout: (projectPath: string) => void;

  // Init Script Indicator Visibility (per-project)
  setShowInitScriptIndicator: (projectPath: string, visible: boolean) => void;
  getShowInitScriptIndicator: (projectPath: string) => boolean;

  // Auto-dismiss Init Script Indicator (per-project)
  setAutoDismissInitScriptIndicator: (projectPath: string, autoDismiss: boolean) => void;
  getAutoDismissInitScriptIndicator: (projectPath: string) => boolean;

  // Init Script State (keyed by projectPath::branch)
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

  // Pending terminal request (for opening terminals from outside the terminal view)
  setPendingTerminalRequest: (request: PendingTerminalRequest | null) => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialTerminalState: TerminalStoreState = {
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
  defaultTerminalId: null,
  initScriptState: {},
  showInitScriptIndicatorByProject: {},
  autoDismissInitScriptIndicatorByProject: {},
  pendingTerminalRequest: null,
};

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

/** Find the first terminal session ID by depth-first traversal. */
function findFirstTerminal(node: TerminalPanelContent | null): string | null {
  if (!node) return null;
  if (node.type === 'terminal') return node.sessionId;
  for (const panel of node.panels) {
    const found = findFirstTerminal(panel);
    if (found) return found;
  }
  return null;
}

/**
 * Remove a terminal from a layout tree and collapse single-child splits.
 * Returns null when the entire subtree has been removed.
 */
function removeAndCollapse(
  node: TerminalPanelContent,
  sessionId: string
): TerminalPanelContent | null {
  if (node.type === 'terminal') {
    return node.sessionId === sessionId ? null : node;
  }
  const newPanels: TerminalPanelContent[] = [];
  for (const panel of node.panels) {
    const result = removeAndCollapse(panel, sessionId);
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
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTerminalStore = create<TerminalStoreState & TerminalStoreActions>()((set, get) => ({
  ...initialTerminalState,

  // ----- Terminal configuration -----

  setDefaultTerminalId: (terminalId) => set({ defaultTerminalId: terminalId }),

  // ----- Terminal auth & session -----

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

  // ----- Terminal layout manipulation -----

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

    let newTabs = current.tabs.map((tab) => {
      if (!tab.layout) return tab;
      const newLayout = removeAndCollapse(tab.layout, sessionId);
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

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeTabId: newActiveTabId,
        activeSessionId: newActiveSessionId,
      },
    });
  },

  swapTerminals: (sessionId1, sessionId2) => {
    const current = get().terminalState;
    if (current.tabs.length === 0) return;

    const swapInLayout = (node: TerminalPanelContent): TerminalPanelContent => {
      if (node.type === 'terminal') {
        if (node.sessionId === sessionId1) return { ...node, sessionId: sessionId2 };
        if (node.sessionId === sessionId2) return { ...node, sessionId: sessionId1 };
        return node;
      }
      return { ...node, panels: node.panels.map(swapInLayout) };
    };

    const newTabs = current.tabs.map((tab) => ({
      ...tab,
      layout: tab.layout ? swapInLayout(tab.layout) : null,
    }));

    set({
      terminalState: { ...current, tabs: newTabs },
    });
  },

  clearTerminalState: () => {
    const current = get().terminalState;
    set({
      terminalState: {
        // Preserve auth state - user shouldn't need to re-authenticate
        isUnlocked: current.isUnlocked,
        authToken: current.authToken,
        // Clear session-specific state only
        tabs: [],
        activeTabId: null,
        activeSessionId: null,
        maximizedSessionId: null,
        // Preserve user preferences - these should persist across projects
        defaultFontSize: current.defaultFontSize,
        defaultRunScript: current.defaultRunScript,
        screenReaderMode: current.screenReaderMode,
        fontFamily: current.fontFamily,
        scrollbackLines: current.scrollbackLines,
        lineHeight: current.lineHeight,
        maxSessions: current.maxSessions,
        // Preserve lastActiveProjectPath - it will be updated separately when needed
        lastActiveProjectPath: current.lastActiveProjectPath,
        // Preserve openTerminalMode - user preference
        openTerminalMode: current.openTerminalMode,
      },
    });
  },

  // ----- Terminal panel settings -----

  setTerminalPanelFontSize: (sessionId, fontSize) => {
    const current = get().terminalState;
    const clampedSize = Math.max(8, Math.min(32, fontSize));

    const updateFontSize = (node: TerminalPanelContent): TerminalPanelContent => {
      if (node.type === 'terminal') {
        if (node.sessionId === sessionId) {
          return { ...node, fontSize: clampedSize };
        }
        return node;
      }
      return { ...node, panels: node.panels.map(updateFontSize) };
    };

    const newTabs = current.tabs.map((tab) => {
      if (!tab.layout) return tab;
      return { ...tab, layout: updateFontSize(tab.layout) };
    });

    set({
      terminalState: { ...current, tabs: newTabs },
    });
  },

  setTerminalDefaultFontSize: (fontSize) => {
    const current = get().terminalState;
    const clampedSize = Math.max(8, Math.min(32, fontSize));
    set({
      terminalState: { ...current, defaultFontSize: clampedSize },
    });
  },

  setTerminalDefaultRunScript: (script) => {
    const current = get().terminalState;
    set({
      terminalState: { ...current, defaultRunScript: script },
    });
  },

  setTerminalScreenReaderMode: (enabled) => {
    const current = get().terminalState;
    set({
      terminalState: { ...current, screenReaderMode: enabled },
    });
  },

  setTerminalFontFamily: (fontFamily) => {
    const current = get().terminalState;
    set({
      terminalState: { ...current, fontFamily },
    });
  },

  setTerminalScrollbackLines: (lines) => {
    const current = get().terminalState;
    // Clamp to reasonable range: 1000 - 100000 lines
    const clampedLines = Math.max(1000, Math.min(100000, lines));
    set({
      terminalState: { ...current, scrollbackLines: clampedLines },
    });
  },

  setTerminalLineHeight: (lineHeight) => {
    const current = get().terminalState;
    // Clamp to reasonable range: 1.0 - 2.0
    const clampedHeight = Math.max(1.0, Math.min(2.0, lineHeight));
    set({
      terminalState: { ...current, lineHeight: clampedHeight },
    });
  },

  setTerminalMaxSessions: (maxSessions) => {
    const current = get().terminalState;
    // Clamp to reasonable range: 1 - 500
    const clampedMax = Math.max(1, Math.min(500, maxSessions));
    set({
      terminalState: { ...current, maxSessions: clampedMax },
    });
  },

  setTerminalLastActiveProjectPath: (projectPath) => {
    const current = get().terminalState;
    set({
      terminalState: { ...current, lastActiveProjectPath: projectPath },
    });
  },

  setOpenTerminalMode: (mode) => {
    const current = get().terminalState;
    set({
      terminalState: { ...current, openTerminalMode: mode },
    });
  },

  // ----- Tab management -----

  addTerminalTab: (name) => {
    const current = get().terminalState;
    const newTabId = `tab-${Date.now()}`;
    const tabNumber = current.tabs.length + 1;
    const newTab: TerminalTab = {
      id: newTabId,
      name: name || `Terminal ${tabNumber}`,
      layout: null,
    };
    set({
      terminalState: {
        ...current,
        tabs: [...current.tabs, newTab],
        activeTabId: newTabId,
      },
    });
    return newTabId;
  },

  removeTerminalTab: (tabId) => {
    const current = get().terminalState;
    const newTabs = current.tabs.filter((t) => t.id !== tabId);
    let newActiveTabId = current.activeTabId;
    let newActiveSessionId = current.activeSessionId;

    if (current.activeTabId === tabId) {
      newActiveTabId = newTabs.length > 0 ? newTabs[0].id : null;
      if (newActiveTabId) {
        const newActiveTab = newTabs.find((t) => t.id === newActiveTabId);
        newActiveSessionId = newActiveTab?.layout ? findFirstTerminal(newActiveTab.layout) : null;
      } else {
        newActiveSessionId = null;
      }
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

    let newActiveSessionId = current.activeSessionId;
    if (tab.layout) {
      newActiveSessionId = findFirstTerminal(tab.layout);
    }

    set({
      terminalState: {
        ...current,
        activeTabId: tabId,
        activeSessionId: newActiveSessionId,
        // Clear maximized state when switching tabs - the maximized terminal
        // belongs to the previous tab and shouldn't persist across tab switches
        maximizedSessionId: null,
      },
    });
  },

  renameTerminalTab: (tabId, name) => {
    const current = get().terminalState;
    const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, name } : t));
    set({
      terminalState: { ...current, tabs: newTabs },
    });
  },

  reorderTerminalTabs: (fromTabId, toTabId) => {
    const current = get().terminalState;
    const fromIndex = current.tabs.findIndex((t) => t.id === fromTabId);
    const toIndex = current.tabs.findIndex((t) => t.id === toTabId);

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return;
    }

    // Reorder tabs by moving fromIndex to toIndex
    const newTabs = [...current.tabs];
    const [movedTab] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, movedTab);

    set({
      terminalState: { ...current, tabs: newTabs },
    });
  },

  moveTerminalToTab: (sessionId, targetTabId) => {
    const current = get().terminalState;

    let sourceTabId: string | null = null;
    let originalTerminalNode: (TerminalPanelContent & { type: 'terminal' }) | null = null;

    const findTerminal = (
      node: TerminalPanelContent
    ): (TerminalPanelContent & { type: 'terminal' }) | null => {
      if (node.type === 'terminal') {
        return node.sessionId === sessionId ? node : null;
      }
      for (const panel of node.panels) {
        const found = findTerminal(panel);
        if (found) return found;
      }
      return null;
    };

    for (const tab of current.tabs) {
      if (tab.layout) {
        const found = findTerminal(tab.layout);
        if (found) {
          sourceTabId = tab.id;
          originalTerminalNode = found;
          break;
        }
      }
    }
    if (!sourceTabId || !originalTerminalNode) return;
    if (sourceTabId === targetTabId) return;

    const sourceTab = current.tabs.find((t) => t.id === sourceTabId);
    if (!sourceTab?.layout) return;

    const newSourceLayout = removeAndCollapse(sourceTab.layout, sessionId);

    let finalTargetTabId = targetTabId;
    let newTabs = current.tabs;

    if (targetTabId === 'new') {
      const newTabId = `tab-${Date.now()}`;
      const sourceWillBeRemoved = !newSourceLayout;
      const tabName = sourceWillBeRemoved ? sourceTab.name : `Terminal ${current.tabs.length + 1}`;
      newTabs = [
        ...current.tabs,
        {
          id: newTabId,
          name: tabName,
          layout: {
            type: 'terminal',
            sessionId,
            size: 100,
            fontSize: originalTerminalNode.fontSize,
          },
        },
      ];
      finalTargetTabId = newTabId;
    } else {
      const targetTab = current.tabs.find((t) => t.id === targetTabId);
      if (!targetTab) return;

      const terminalNode: TerminalPanelContent = {
        type: 'terminal',
        sessionId,
        size: 50,
        fontSize: originalTerminalNode.fontSize,
      };
      let newTargetLayout: TerminalPanelContent;

      if (!targetTab.layout) {
        newTargetLayout = {
          type: 'terminal',
          sessionId,
          size: 100,
          fontSize: originalTerminalNode.fontSize,
        };
      } else if (targetTab.layout.type === 'terminal') {
        newTargetLayout = {
          type: 'split',
          id: generateSplitId(),
          direction: 'horizontal',
          panels: [{ ...targetTab.layout, size: 50 }, terminalNode],
        };
      } else {
        newTargetLayout = {
          ...targetTab.layout,
          panels: [...targetTab.layout.panels, terminalNode],
        };
      }

      newTabs = current.tabs.map((t) =>
        t.id === targetTabId ? { ...t, layout: newTargetLayout } : t
      );
    }

    if (!newSourceLayout) {
      newTabs = newTabs.filter((t) => t.id !== sourceTabId);
    } else {
      newTabs = newTabs.map((t) => (t.id === sourceTabId ? { ...t, layout: newSourceLayout } : t));
    }

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeTabId: finalTargetTabId,
        activeSessionId: sessionId,
      },
    });
  },

  addTerminalToTab: (sessionId, tabId, direction = 'horizontal', branchName) => {
    const current = get().terminalState;
    const tab = current.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const terminalNode: TerminalPanelContent = {
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
        panels: [{ ...tab.layout, size: 50 }, terminalNode],
      };
    } else {
      if (tab.layout.direction === direction) {
        const newSize = 100 / (tab.layout.panels.length + 1);
        newLayout = {
          ...tab.layout,
          panels: [
            ...tab.layout.panels.map((p) => ({ ...p, size: newSize })),
            { ...terminalNode, size: newSize },
          ],
        };
      } else {
        newLayout = {
          type: 'split',
          id: generateSplitId(),
          direction,
          panels: [{ ...tab.layout, size: 50 }, terminalNode],
        };
      }
    }

    const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, layout: newLayout } : t));

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeTabId: tabId,
        activeSessionId: sessionId,
      },
    });
  },

  setTerminalTabLayout: (tabId, layout, activeSessionId) => {
    const current = get().terminalState;
    const tab = current.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, layout } : t));
    const newActiveSessionId = activeSessionId || findFirstTerminal(layout);

    set({
      terminalState: {
        ...current,
        tabs: newTabs,
        activeTabId: tabId,
        activeSessionId: newActiveSessionId,
      },
    });
  },

  updateTerminalPanelSizes: (tabId, panelKeys, sizes) => {
    const current = get().terminalState;
    const tab = current.tabs.find((t) => t.id === tabId);
    if (!tab || !tab.layout) return;

    // Create a map of panel key to new size
    const sizeMap = new Map<string, number>();
    panelKeys.forEach((key, index) => {
      sizeMap.set(key, sizes[index]);
    });

    // Helper to generate panel key (matches getPanelKey in terminal-view.tsx)
    const getPanelKey = (panel: TerminalPanelContent): string => {
      if (panel.type === 'terminal') return panel.sessionId;
      const childKeys = panel.panels.map(getPanelKey).join('-');
      return `split-${panel.direction}-${childKeys}`;
    };

    // Recursively update sizes in the layout
    const updateSizes = (panel: TerminalPanelContent): TerminalPanelContent => {
      const key = getPanelKey(panel);
      const newSize = sizeMap.get(key);

      if (panel.type === 'terminal') {
        return newSize !== undefined ? { ...panel, size: newSize } : panel;
      }

      return {
        ...panel,
        size: newSize !== undefined ? newSize : panel.size,
        panels: panel.panels.map(updateSizes),
      };
    };

    const updatedLayout = updateSizes(tab.layout);

    const newTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, layout: updatedLayout } : t));

    set({
      terminalState: { ...current, tabs: newTabs },
    });
  },

  // ----- Layout persistence -----

  // Convert runtime layout to persisted format (preserves sessionIds for reconnection)
  saveTerminalLayout: (projectPath) => {
    const current = get().terminalState;
    if (current.tabs.length === 0) {
      // Nothing to save, clear any existing layout
      const next = { ...get().terminalLayoutByProject };
      delete next[projectPath];
      set({ terminalLayoutByProject: next });
      return;
    }

    // Convert TerminalPanelContent to PersistedTerminalPanel
    // Now preserves sessionId so we can reconnect when switching back
    const persistPanel = (panel: TerminalPanelContent): PersistedTerminalPanel => {
      if (panel.type === 'terminal') {
        return {
          type: 'terminal',
          size: panel.size,
          fontSize: panel.fontSize,
          sessionId: panel.sessionId, // Preserve for reconnection
          branchName: panel.branchName, // Preserve branch name for display
        };
      }
      return {
        type: 'split',
        id: panel.id, // Preserve stable ID
        direction: panel.direction,
        panels: panel.panels.map(persistPanel),
        size: panel.size,
      };
    };

    const persistedTabs: PersistedTerminalTab[] = current.tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      layout: tab.layout ? persistPanel(tab.layout) : null,
    }));

    const activeTabIndex = current.tabs.findIndex((t) => t.id === current.activeTabId);

    const persisted: PersistedTerminalState = {
      tabs: persistedTabs,
      activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0,
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
        [projectPath]: persisted,
      },
    });
  },

  getPersistedTerminalLayout: (projectPath) => {
    return get().terminalLayoutByProject[projectPath] || null;
  },

  clearPersistedTerminalLayout: (projectPath) => {
    const next = { ...get().terminalLayoutByProject };
    delete next[projectPath];
    set({ terminalLayoutByProject: next });
  },

  // ----- Init Script Indicator Visibility (per-project) -----

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

  // ----- Auto-dismiss Init Script Indicator (per-project) -----

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

  // ----- Init Script State (keyed by "projectPath::branch") -----

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

  setPendingTerminalRequest: (request) => {
    set({ pendingTerminalRequest: request });
  },
}));
