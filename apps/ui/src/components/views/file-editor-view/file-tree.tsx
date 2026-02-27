import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFileEditorStore } from './use-file-editor-store';

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
  /** Absolute path of the directory to browse (project root or worktree) */
  projectPath: string;
  /** Git status map keyed by relative file path */
  gitStatusMap: Record<string, FileStatus>;
}

interface TreeNodeProps {
  entry: BrowseEntry;
  projectPath: string;
  gitStatusMap: Record<string, FileStatus>;
  depth: number;
}

function getGitStatusColor(status: FileStatus | undefined): string {
  if (!status) return '';
  const code = status.indexStatus !== ' ' ? status.indexStatus : status.workTreeStatus;
  switch (code) {
    case 'A':
    case '?':
      return 'text-green-500';
    case 'D':
      return 'text-red-500';
    case 'M':
    case 'U':
      return 'text-amber-500';
    case 'R':
    case 'C':
      return 'text-blue-400';
    default:
      return '';
  }
}

function TreeNode({ entry, projectPath, gitStatusMap, depth }: TreeNodeProps) {
  const { expandedDirs, toggleDir, openFile } = useFileEditorStore();
  const [children, setChildren] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const isExpanded = expandedDirs.includes(entry.relativePath);

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

  // Load children when already expanded (on mount / re-render)
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
            <FolderOpen className="size-3.5 shrink-0 text-sky-400" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-sky-500" />
          )}
          <span className="truncate">{entry.name}</span>
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
      className={cn(
        'flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-xs',
        'hover:bg-accent/60 transition-colors',
        statusColor || 'text-foreground/80'
      )}
      style={{ paddingLeft: `${indentPx + 8}px` }}
    >
      <File className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function FileTree({ projectPath, gitStatusMap }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoot() {
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
    }

    void loadRoot();
  }, [projectPath]);

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
    <div className="select-none py-1">
      {rootEntries.map((entry) => (
        <TreeNode
          key={entry.relativePath}
          entry={entry}
          projectPath={projectPath}
          gitStatusMap={gitStatusMap}
          depth={0}
        />
      ))}
    </div>
  );
}
