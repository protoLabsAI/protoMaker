import { useEffect, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { NotebookPen } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useNotesStore, scheduleSave } from '@/store/notes-store';
import { NotesTabBar } from './notes-view/notes-tab-bar';
import { NotesToolbar } from './notes-view/notes-toolbar';
import { TiptapEditor } from './notes-view/tiptap-editor';
import { NotesStatusBar } from './notes-view/notes-status-bar';
import { Spinner } from '@protolabs/ui/atoms';

export function NotesView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const {
    workspace,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    loadWorkspace,
    switchTab,
    addTab,
    closeTab,
    renameTab,
    updateTabContent,
    updateTabPermissions,
  } = useNotesStore();

  const [editor, setEditor] = useState<Editor | null>(null);
  const projectPath = currentProject?.path;

  // Load workspace on mount / project change
  useEffect(() => {
    if (projectPath) {
      loadWorkspace(projectPath);
    }
  }, [projectPath, loadWorkspace]);

  const activeTab = workspace?.activeTabId ? workspace.tabs[workspace.activeTabId] : null;

  const handleContentUpdate = useCallback(
    (content: string) => {
      if (!activeTab || !projectPath) return;
      updateTabContent(activeTab.id, content);
      scheduleSave(projectPath);
    },
    [activeTab, projectPath, updateTabContent]
  );

  const handleToggleAgentRead = useCallback(() => {
    if (!activeTab || !projectPath) return;
    updateTabPermissions(activeTab.id, { agentRead: !activeTab.permissions.agentRead });
    scheduleSave(projectPath);
  }, [activeTab, projectPath, updateTabPermissions]);

  const handleAddTab = useCallback(() => {
    addTab();
    if (projectPath) scheduleSave(projectPath);
  }, [addTab, projectPath]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(tabId);
      if (projectPath) scheduleSave(projectPath);
    },
    [closeTab, projectPath]
  );

  const handleRenameTab = useCallback(
    (tabId: string, name: string) => {
      renameTab(tabId, name);
      if (projectPath) scheduleSave(projectPath);
    },
    [renameTab, projectPath]
  );

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Select a project to view notes</p>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const tabs = workspace.tabOrder.map((id) => workspace.tabs[id]).filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <NotebookPen className="size-4 text-primary" />
        <h1 className="text-sm font-medium">Notes</h1>
      </div>

      {/* Tab bar */}
      <NotesTabBar
        tabs={tabs}
        activeTabId={workspace.activeTabId}
        onSwitch={switchTab}
        onAdd={handleAddTab}
        onClose={handleCloseTab}
        onRename={handleRenameTab}
      />

      {/* Toolbar */}
      {activeTab && (
        <NotesToolbar
          editor={editor}
          permissions={activeTab.permissions}
          onToggleAgentRead={handleToggleAgentRead}
        />
      )}

      {/* Editor */}
      {activeTab ? (
        <TiptapEditor
          key={activeTab.id}
          content={activeTab.content}
          onUpdate={handleContentUpdate}
          onEditorReady={setEditor}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p>No tab selected</p>
        </div>
      )}

      {/* Status bar */}
      {activeTab && (
        <NotesStatusBar
          wordCount={activeTab.metadata.wordCount ?? 0}
          characterCount={activeTab.metadata.characterCount ?? 0}
          isSaving={isSaving}
          hasUnsavedChanges={hasUnsavedChanges}
          permissions={activeTab.permissions}
        />
      )}
    </div>
  );
}
