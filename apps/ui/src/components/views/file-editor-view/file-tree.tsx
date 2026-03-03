import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { apiPost } from '@/lib/api-fetch';
import { useFileEditorStore } from './use-file-editor-store';
import { FileTreeContextMenu, type ContextMenuTarget } from './components/file-tree-context-menu';

interface BrowseEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  isFile: boolean;
}

interface FileStatus {
  filePath: string;
  indexStatus: string;
  workTreeStatus: string;
  statusLabel: string;
}

interface FileTreeProps {
  projectPath: string;
  gitStatusMap: Record<string, FileStatus>;
  onMutation?: () => void;
}

interface TreeNodeProps {
  entry: BrowseEntry;
  projectPath: string;
  gitStatusMap: Record<string, FileStatus>;
  depth: number;
  onContextMenu: (target: ContextMenuTarget) => void;
  renamingPath: string | null;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
}

function getGitStatusColor(status: FileStatus | undefined): string {
  if (!status) return '';
  const code = status.indexStatus !== ' ' ? status.indexStatus : status.workTreeStatus;
  switch (code) {
    case 'A':
    case '?':
      return 'text-status-success';
    case 'D':
      return 'text-destructive';
    case 'M':
    case 'U':
      return 'text-status-warning';
    case 'R':
    case 'C':
      return 'text-primary';
    default:
      return '';
  }
}

function InlineRenameInput({
  defaultValue,
  onSubmit,
  onCancel,
}: {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select the filename without the extension
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dotIdx = defaultValue.lastIndexOf('.');
    input.setSelectionRange(0, dotIdx > 0 ? dotIdx : defaultValue.length);
  }, [defaultValue]);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={defaultValue}
      className="w-full bg-background border border-primary rounded px-1 py-0 text-xs outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSubmit((e.target as HTMLInputElement).value.trim());
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={(e) => {
        const val = e.target.value.trim();
        if (val && val !== defaultValue) {
          onSubmit(val);
        } else {
          onCancel();
        }
      }}
    />
  );
}

function TreeNode({
  entry,
  projectPath,
  gitStatusMap,
  depth,
  onContextMenu,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
}: TreeNodeProps) {
  const { expandedDirs, toggleDir, openFile } = useFileEditorStore();
  const [children, setChildren] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const isExpanded = expandedDirs.includes(entry.relativePath);
  const isRenaming = renamingPath === entry.relativePath;

  const loadChildren = useCallback(
    async (relativePath: string) => {
      setLoading(true);
      try {
        const res = await fetch('/api/fs/browse-project-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath, relativePath }),
        });
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; entries: BrowseEntry[] };
          if (data.success) {
            const sorted = [...data.entries].sort((a, b) => {
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
            setChildren(sorted);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [projectPath]
  );

  const handleToggle = useCallback(async () => {
    if (!entry.isDirectory) return;
    if (!isExpanded && children.length === 0) {
      await loadChildren(entry.relativePath);
    }
    toggleDir(entry.relativePath);
  }, [entry, isExpanded, children.length, loadChildren, toggleDir]);

  const handleFileClick = useCallback(() => {
    if (!entry.isFile) return;
    void openFile(`${projectPath}/${entry.relativePath}`);
  }, [entry, projectPath, openFile]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu({
        x: e.clientX,
        y: e.clientY,
        relativePath: entry.relativePath,
        isDirectory: entry.isDirectory,
      });
    },
    [entry, onContextMenu]
  );

  useEffect(() => {
    if (entry.isDirectory && isExpanded && children.length === 0) {
      void loadChildren(entry.relativePath);
    }
  }, [entry, isExpanded, children.length, loadChildren]);

  const gitStatus = gitStatusMap[entry.relativePath];
  const statusColor = getGitStatusColor(gitStatus);
  const indentPx = depth * 12;

  if (entry.isDirectory) {
    return (
      <div>
        <button
          onClick={handleToggle}
          onContextMenu={handleContextMenu}
          className={cn(
            'flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-xs',
            'hover:bg-accent/60 transition-colors',
            statusColor
          )}
          style={{ paddingLeft: `${indentPx + 8}px` }}
        >
          {loading ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-primary" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-primary" />
          )}
          {isRenaming ? (
            <InlineRenameInput
              defaultValue={entry.name}
              onSubmit={(newName) => onRenameSubmit(entry.relativePath, newName)}
              onCancel={onRenameCancel}
            />
          ) : (
            <span className="truncate">{entry.name}</span>
          )}
        </button>

        {isExpanded && !loading && (
          <div>
            {children.map((child) => (
              <TreeNode
                key={child.relativePath}
                entry={child}
                projectPath={projectPath}
                gitStatusMap={gitStatusMap}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleFileClick}
      onContextMenu={handleContextMenu}
      className={cn(
        'flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-xs',
        'hover:bg-accent/60 transition-colors',
        statusColor || 'text-foreground/80'
      )}
      style={{ paddingLeft: `${indentPx + 8}px` }}
    >
      <File className="size-3.5 shrink-0 text-muted-foreground" />
      {isRenaming ? (
        <InlineRenameInput
          defaultValue={entry.name}
          onSubmit={(newName) => onRenameSubmit(entry.relativePath, newName)}
          onCancel={onRenameCancel}
        />
      ) : (
        <span className="truncate">{entry.name}</span>
      )}
    </button>
  );
}

export function FileTree({ projectPath, gitStatusMap, onMutation }: FileTreeProps) {
  const { closeTab, tabs } = useFileEditorStore();
  const [rootEntries, setRootEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const treeVersion = useRef(0);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fs/browse-project-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });
      if (!res.ok) {
        setError('Failed to load project files');
        return;
      }
      const data = (await res.json()) as { success: boolean; entries: BrowseEntry[] };
      if (data.success) {
        const sorted = [...data.entries].sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setRootEntries(sorted);
      } else {
        setError('Failed to load project files');
      }
    } catch {
      setError('Network error loading files');
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot]);

  const refreshTree = useCallback(() => {
    treeVersion.current += 1;
    void loadRoot();
    onMutation?.();
  }, [loadRoot, onMutation]);

  // -- File operations -------------------------------------------------------

  const handleNewFile = useCallback(
    async (parentDir: string) => {
      const name = window.prompt('New file name:');
      if (!name?.trim()) return;
      const filePath = `${projectPath}/${parentDir === '.' ? '' : parentDir + '/'}${name.trim()}`;
      try {
        await apiPost<{ success: boolean }>('/api/fs/write', { filePath, content: '' });
        toast.success(`Created ${name.trim()}`);
        refreshTree();
      } catch {
        toast.error('Failed to create file');
      }
    },
    [projectPath, refreshTree]
  );

  const handleNewFolder = useCallback(
    async (parentDir: string) => {
      const name = window.prompt('New folder name:');
      if (!name?.trim()) return;
      const dirPath = `${projectPath}/${parentDir === '.' ? '' : parentDir + '/'}${name.trim()}`;
      try {
        await apiPost<{ success: boolean }>('/api/fs/mkdir', { dirPath });
        toast.success(`Created ${name.trim()}/`);
        refreshTree();
      } catch {
        toast.error('Failed to create folder');
      }
    },
    [projectPath, refreshTree]
  );

  const handleRename = useCallback((relativePath: string) => {
    setRenamingPath(relativePath);
  }, []);

  const handleRenameSubmit = useCallback(
    async (oldRelPath: string, newName: string) => {
      setRenamingPath(null);
      const parentDir = oldRelPath.split('/').slice(0, -1).join('/');
      const newRelPath = parentDir ? `${parentDir}/${newName}` : newName;
      if (newRelPath === oldRelPath) return;

      const srcPath = `${projectPath}/${oldRelPath}`;
      const destPath = `${projectPath}/${newRelPath}`;
      try {
        await apiPost<{ success: boolean }>('/api/fs/move', { srcPath, destPath });
        toast.success(`Renamed to ${newName}`);
        refreshTree();
      } catch {
        toast.error('Failed to rename');
      }
    },
    [projectPath, refreshTree]
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handleDelete = useCallback(
    async (relativePath: string, _isDirectory: boolean) => {
      const fullPath = `${projectPath}/${relativePath}`;
      try {
        await apiPost<{ success: boolean }>('/api/fs/delete', { filePath: fullPath });
        toast.success(`Deleted ${relativePath.split('/').pop()}`);
        // Close any tab for the deleted file
        const tab = tabs.find((t) => t.filePath === fullPath);
        if (tab) closeTab(tab.id);
        refreshTree();
      } catch {
        toast.error('Failed to delete');
      }
    },
    [projectPath, refreshTree, tabs, closeTab]
  );

  const handleCopyRelativePath = useCallback((relativePath: string) => {
    void navigator.clipboard.writeText(relativePath);
    toast.success('Copied relative path');
  }, []);

  const handleCopyAbsolutePath = useCallback(
    (relativePath: string) => {
      void navigator.clipboard.writeText(`${projectPath}/${relativePath}`);
      toast.success('Copied absolute path');
    },
    [projectPath]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="px-3 py-4 text-xs text-destructive">{error}</div>;
  }

  if (rootEntries.length === 0) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">No files found</div>;
  }

  return (
    <>
      <div className="select-none py-1">
        {rootEntries.map((entry) => (
          <TreeNode
            key={entry.relativePath}
            entry={entry}
            projectPath={projectPath}
            gitStatusMap={gitStatusMap}
            depth={0}
            onContextMenu={setContextMenuTarget}
            renamingPath={renamingPath}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
          />
        ))}
      </div>

      {contextMenuTarget && (
        <FileTreeContextMenu
          target={contextMenuTarget}
          onClose={() => setContextMenuTarget(null)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
          onCopyRelativePath={handleCopyRelativePath}
          onCopyAbsolutePath={handleCopyAbsolutePath}
        />
      )}
    </>
  );
}
