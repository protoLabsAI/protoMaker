import { create } from 'zustand';
import type { NotesWorkspace, NoteTab, NoteTabPermissions } from '@automaker/types';
import { getHttpApiClient } from '@/lib/http-api-client';

interface NotesState {
  workspace: NotesWorkspace | null;
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
}

interface NotesActions {
  loadWorkspace: (projectPath: string) => Promise<void>;
  saveWorkspace: (projectPath: string) => Promise<void>;
  switchTab: (tabId: string) => void;
  addTab: (name?: string) => void;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  updateTabPermissions: (tabId: string, permissions: Partial<NoteTabPermissions>) => void;
  reorderTabs: (tabOrder: string[]) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSavePath: string | null = null;

function createDefaultWorkspace(): NotesWorkspace {
  const now = Date.now();
  const id = crypto.randomUUID();
  return {
    version: 1,
    activeTabId: id,
    tabOrder: [id],
    tabs: {
      [id]: {
        id,
        name: 'Notes',
        content: '',
        permissions: { agentRead: true, agentWrite: true },
        metadata: { createdAt: now, updatedAt: now, wordCount: 0, characterCount: 0 },
      },
    },
  };
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function countChars(html: string): number {
  return html.replace(/<[^>]*>/g, '').length;
}

function scheduleSave(projectPath: string) {
  pendingSavePath = projectPath;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const store = useNotesStore.getState();
    if (store.workspace && pendingSavePath) {
      store.saveWorkspace(pendingSavePath);
    }
  }, 500);
}

export const useNotesStore = create<NotesState & NotesActions>((set, get) => ({
  workspace: null,
  isLoading: false,
  isSaving: false,
  hasUnsavedChanges: false,

  loadWorkspace: async (projectPath: string) => {
    set({ isLoading: true });
    try {
      const client = getHttpApiClient();
      const { workspace } = await client.notes.getWorkspace(projectPath);
      set({ workspace, isLoading: false, hasUnsavedChanges: false });
    } catch {
      set({ workspace: createDefaultWorkspace(), isLoading: false, hasUnsavedChanges: false });
    }
  },

  saveWorkspace: async (projectPath: string) => {
    const { workspace } = get();
    if (!workspace) return;
    set({ isSaving: true });
    try {
      const client = getHttpApiClient();
      await client.notes.saveWorkspace(projectPath, workspace);
      set({ isSaving: false, hasUnsavedChanges: false });
    } catch {
      set({ isSaving: false });
    }
  },

  switchTab: (tabId: string) => {
    const { workspace } = get();
    if (!workspace || !workspace.tabs[tabId]) return;
    set({ workspace: { ...workspace, activeTabId: tabId } });
  },

  addTab: (name?: string) => {
    const { workspace } = get();
    if (!workspace) return;
    const now = Date.now();
    const id = crypto.randomUUID();
    const tab: NoteTab = {
      id,
      name: name ?? `Tab ${workspace.tabOrder.length + 1}`,
      content: '',
      permissions: { agentRead: true, agentWrite: true },
      metadata: { createdAt: now, updatedAt: now, wordCount: 0, characterCount: 0 },
    };
    set({
      workspace: {
        ...workspace,
        activeTabId: id,
        tabOrder: [...workspace.tabOrder, id],
        tabs: { ...workspace.tabs, [id]: tab },
      },
      hasUnsavedChanges: true,
    });
  },

  closeTab: (tabId: string) => {
    const { workspace } = get();
    if (!workspace) return;
    const newTabOrder = workspace.tabOrder.filter((id) => id !== tabId);
    if (newTabOrder.length === 0) return; // Don't close last tab
    const newTabs = { ...workspace.tabs };
    delete newTabs[tabId];
    const activeTabId =
      workspace.activeTabId === tabId
        ? newTabOrder[Math.max(0, newTabOrder.length - 1)]
        : workspace.activeTabId;
    set({
      workspace: { ...workspace, activeTabId, tabOrder: newTabOrder, tabs: newTabs },
      hasUnsavedChanges: true,
    });
  },

  renameTab: (tabId: string, name: string) => {
    const { workspace } = get();
    if (!workspace || !workspace.tabs[tabId]) return;
    set({
      workspace: {
        ...workspace,
        tabs: {
          ...workspace.tabs,
          [tabId]: {
            ...workspace.tabs[tabId],
            name,
            metadata: { ...workspace.tabs[tabId].metadata, updatedAt: Date.now() },
          },
        },
      },
      hasUnsavedChanges: true,
    });
  },

  updateTabContent: (tabId: string, content: string) => {
    const { workspace } = get();
    if (!workspace || !workspace.tabs[tabId]) return;
    set({
      workspace: {
        ...workspace,
        tabs: {
          ...workspace.tabs,
          [tabId]: {
            ...workspace.tabs[tabId],
            content,
            metadata: {
              ...workspace.tabs[tabId].metadata,
              updatedAt: Date.now(),
              wordCount: countWords(content),
              characterCount: countChars(content),
            },
          },
        },
      },
      hasUnsavedChanges: true,
    });
  },

  updateTabPermissions: (tabId: string, permissions: Partial<NoteTabPermissions>) => {
    const { workspace } = get();
    if (!workspace || !workspace.tabs[tabId]) return;
    set({
      workspace: {
        ...workspace,
        tabs: {
          ...workspace.tabs,
          [tabId]: {
            ...workspace.tabs[tabId],
            permissions: { ...workspace.tabs[tabId].permissions, ...permissions },
            metadata: { ...workspace.tabs[tabId].metadata, updatedAt: Date.now() },
          },
        },
      },
      hasUnsavedChanges: true,
    });
  },

  reorderTabs: (tabOrder: string[]) => {
    const { workspace } = get();
    if (!workspace) return;
    set({ workspace: { ...workspace, tabOrder }, hasUnsavedChanges: true });
  },
}));

export { scheduleSave };
