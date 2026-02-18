export interface NoteTabPermissions {
  agentRead: boolean;
  agentWrite: boolean;
}

export interface NoteTab {
  id: string;
  name: string;
  content: string; // Tiptap HTML
  permissions: NoteTabPermissions;
  metadata: {
    createdAt: number;
    updatedAt: number;
    wordCount?: number;
    characterCount?: number;
  };
}

export interface NotesWorkspace {
  version: 1;
  activeTabId: string | null;
  tabOrder: string[];
  tabs: Record<string, NoteTab>;
}
