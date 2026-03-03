import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FolderOpen, FileCode, Settings, GitCompareArrows } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@protolabs-ai/ui/atoms';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs-ai/ui/atoms';
import { useAppStore } from '@/store/app-store';
import { apiPost } from '@/lib/api-fetch';
import { useFileEditorStore } from './use-file-editor-store';
import { FileTree } from './file-tree';
import { EditorTabs } from './editor-tabs';
import { CodeEditor } from './code-editor';
import { WorktreeDirectoryDropdown } from './worktree-directory-dropdown';
import { GitDetailPanel } from './components/git-detail-panel';
import { EditorSettingsForm } from './components/editor-settings-form';
import {
  isMarkdownFile,
  MarkdownViewToolbar,
  MarkdownPreviewPanel,
} from './components/markdown-preview';

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
  const {
    tabs,
    activeTabId,
    selectedWorktreePath,
    updateTabCursor,
    markdownViewMode,
    setMarkdownViewMode,
    activeFileGitDetails,
    showInlineDiff,
    setShowInlineDiff,
    activeFileDiff,
    setActiveFileDiff,
  } = useFileEditorStore();
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, FileStatus>>({});

  const browsePath = selectedWorktreePath ?? currentProject?.path ?? null;

  // Load git status whenever the browsed path changes
  useEffect(() => {
    if (!browsePath) return;
    void fetchGitStatus(browsePath).then(setGitStatusMap);
  }, [browsePath]);

  // Fetch git details for the active tab
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const setActiveFileGitDetails = useFileEditorStore((s) => s.setActiveFileGitDetails);

  useEffect(() => {
    if (!activeTab || !browsePath) {
      setActiveFileGitDetails(null);
      return;
    }
    void apiPost<{ success: boolean; details: unknown }>('/api/git/details', {
      projectPath: browsePath,
      filePath: activeTab.filePath.startsWith(browsePath)
        ? activeTab.filePath.slice(browsePath.length + 1)
        : activeTab.filePath,
    }).then((res) => {
      if (res.success && res.details) {
        setActiveFileGitDetails(
          res.details as {
            hash: string;
            shortHash: string;
            message: string;
            author: string;
            timestamp: string;
            isoDate: string;
          }
        );
      } else {
        setActiveFileGitDetails(null);
      }
    });
  }, [activeTab?.id, browsePath, setActiveFileGitDetails]);

  // Fetch diff when inline diff is toggled on
  useEffect(() => {
    if (!showInlineDiff || !activeTab || !browsePath) {
      setActiveFileDiff(null);
      return;
    }
    const relPath = activeTab.filePath.startsWith(browsePath)
      ? activeTab.filePath.slice(browsePath.length + 1)
      : activeTab.filePath;
    void apiPost<{ success: boolean; diff: string }>('/api/git/file-diff', {
      projectPath: browsePath,
      filePath: relPath,
    }).then((res) => {
      if (res.success) {
        setActiveFileDiff(res.diff || null);
      }
    });
  }, [showInlineDiff, activeTab?.id, browsePath, setActiveFileDiff]);

  // Ctrl+S global fallback (in case CodeMirror doesn't have focus)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleCursorChange = useCallback(
    (line: number, col: number) => {
      if (activeTab) {
        updateTabCursor(activeTab.id, line, col);
      }
    },
    [activeTab, updateTabCursor]
  );

  // Refresh git status + tree after file operations
  const refreshAfterMutation = useCallback(() => {
    if (browsePath) {
      void fetchGitStatus(browsePath).then(setGitStatusMap);
    }
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

  const isActiveMarkdown = activeTab ? isMarkdownFile(activeTab.fileName) : false;
  const showMarkdownPreview =
    isActiveMarkdown && (markdownViewMode === 'preview' || markdownViewMode === 'split');
  const showCodeEditor = !isActiveMarkdown || markdownViewMode !== 'preview';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <FileCode className="size-4 text-primary" />
          <div>
            <h1 className="text-sm font-medium leading-none">File Editor</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {browsePath?.split('/').pop() ?? 'No project'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Markdown mode toggle (only for .md files) */}
          {isActiveMarkdown && (
            <MarkdownViewToolbar mode={markdownViewMode} onChange={setMarkdownViewMode} />
          )}

          {/* Inline diff toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showInlineDiff ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowInlineDiff(!showInlineDiff)}
                >
                  <GitCompareArrows className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle inline diff</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Editor settings */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Settings className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <EditorSettingsForm />
            </PopoverContent>
          </Popover>

          <WorktreeDirectoryDropdown />
        </div>
      </div>

      {/* Tab bar */}
      <EditorTabs />

      {/* Main resizable layout */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* File tree panel */}
          <Panel defaultSize={25} minSize={15} maxSize={50}>
            <div className="flex h-full flex-col overflow-hidden border-r border-border/40">
              <div className="flex shrink-0 items-center px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Explorer</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {browsePath ? (
                  <FileTree
                    projectPath={browsePath}
                    gitStatusMap={gitStatusMap}
                    onMutation={refreshAfterMutation}
                  />
                ) : (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    No directory selected
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-px bg-border/60 hover:bg-primary/40 transition-colors cursor-col-resize" />

          {/* Editor panel */}
          <Panel defaultSize={75} minSize={40}>
            <div className="flex h-full flex-col overflow-hidden">
              {activeTab ? (
                <>
                  {/* Editor / Markdown split area */}
                  <div className="flex-1 overflow-hidden flex">
                    {showCodeEditor && (
                      <div
                        className={
                          showMarkdownPreview
                            ? 'flex-1 overflow-hidden border-r border-border/40'
                            : 'flex-1 overflow-hidden'
                        }
                      >
                        <CodeEditor
                          tab={activeTab}
                          onCursorChange={handleCursorChange}
                          diffContent={showInlineDiff ? activeFileDiff : undefined}
                        />
                      </div>
                    )}
                    {showMarkdownPreview && (
                      <div className="flex-1 overflow-hidden">
                        <MarkdownPreviewPanel content={activeTab.content} />
                      </div>
                    )}
                  </div>
                  {/* Git detail panel */}
                  <GitDetailPanel details={activeFileGitDetails} />
                  {/* Status bar */}
                  <div className="flex shrink-0 items-center justify-between border-t border-border/40 bg-muted/30 px-3 py-0.5 text-[11px] text-muted-foreground">
                    <span className="truncate max-w-[50%]">{activeTab.filePath}</span>
                    <span>
                      Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <FileCode className="size-8 opacity-30" />
                  <p className="text-sm mt-2">Select a file to view it</p>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
