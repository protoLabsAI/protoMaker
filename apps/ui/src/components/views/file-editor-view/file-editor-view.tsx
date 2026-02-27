import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FolderOpen, X, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useFileEditorStore } from './use-file-editor-store';
import { FileTree } from './file-tree';
import { WorktreeDirectoryDropdown } from './worktree-directory-dropdown';

interface FileStatus {
  filePath: string;
  indexStatus: string;
  workTreeStatus: string;
  isConflicted: boolean;
  isStaged: boolean;
  linesAdded: number;
  linesRemoved: number;
  statusLabel: string;
}

/** Fetch git status for the given project path */
async function fetchGitStatus(projectPath: string): Promise<Record<string, FileStatus>> {
  try {
    const res = await fetch('/api/git/enhanced-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { success: boolean; files: FileStatus[] };
    if (!data.success) return {};
    return Object.fromEntries(data.files.map((f) => [f.filePath, f]));
  } catch {
    return {};
  }
}

export function FileEditorView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const { tabs, activeTabId, selectedWorktreePath, setActiveTab, closeTab } = useFileEditorStore();
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, FileStatus>>({});

  // The path being browsed: prefer selectedWorktreePath, fall back to project root
  const browsePath = selectedWorktreePath ?? currentProject?.path ?? null;

  // Load git status whenever the browsed path changes
  useEffect(() => {
    if (!browsePath) return;
    void fetchGitStatus(browsePath).then(setGitStatusMap);
  }, [browsePath]);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <FolderOpen className="size-8 opacity-40" />
          <p className="text-sm">Select a project to browse files</p>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <FileCode className="size-4 text-primary" />
        <h1 className="text-sm font-medium">File Editor</h1>
        <div className="ml-auto">
          <WorktreeDirectoryDropdown />
        </div>
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/60 bg-muted/30 px-2 py-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs',
                'cursor-pointer transition-colors',
                activeTabId === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="max-w-[140px] truncate">{tab.fileName}</span>
              <button
                className="ml-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close ${tab.fileName}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main resizable layout */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* File tree panel */}
          <Panel defaultSize={25} minSize={15} maxSize={50}>
            <div className="flex h-full flex-col overflow-hidden border-r border-border/40">
              {/* Tree header */}
              <div className="flex shrink-0 items-center px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Explorer</span>
              </div>
              {/* Scrollable tree */}
              <div className="flex-1 overflow-y-auto">
                {browsePath ? (
                  <FileTree projectPath={browsePath} gitStatusMap={gitStatusMap} />
                ) : (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    No directory selected
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-px bg-border/60 hover:bg-primary/40 transition-colors cursor-col-resize" />

          {/* Editor / content panel */}
          <Panel defaultSize={75} minSize={40}>
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              {activeTab ? (
                <div className="flex flex-col items-center gap-2">
                  <FileCode className="size-8 opacity-40" />
                  <p className="text-sm font-medium">{activeTab.fileName}</p>
                  <p className="text-xs opacity-60 max-w-xs text-center break-all">
                    {activeTab.filePath}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileCode className="size-8 opacity-30" />
                  <p className="text-sm">Select a file to view it</p>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
