import { GitBranch, FolderOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@protolabs-ai/ui/atoms';
import { Button } from '@protolabs-ai/ui/atoms';
import { useAppStore } from '@/store/app-store';
import { useWorktreeStore } from '@/store/worktree-store';
import { useFileEditorStore } from './use-file-editor-store';

export function WorktreeDirectoryDropdown() {
  const currentProject = useAppStore((s) => s.currentProject);
  const worktreesByProject = useWorktreeStore((s) => s.worktreesByProject);
  const { selectedWorktreePath, setSelectedWorktreePath } = useFileEditorStore();

  if (!currentProject) return null;

  const worktrees = worktreesByProject[currentProject.path] ?? [];

  // Determine what to display as the current selection
  const activeWorktree = worktrees.find((wt) => wt.path === selectedWorktreePath);
  const displayLabel =
    selectedWorktreePath === null
      ? 'Main Repo'
      : (activeWorktree?.branch ?? selectedWorktreePath.split('/').pop() ?? 'Worktree');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <GitBranch className="size-3.5" />
          <span className="max-w-[140px] truncate">{displayLabel}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {/* Main repository entry */}
        <DropdownMenuItem className="gap-2" onClick={() => setSelectedWorktreePath(null)}>
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Main Repo</span>
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              {currentProject.path.split('/').pop()}
            </span>
          </div>
          {selectedWorktreePath === null && <span className="ml-auto text-xs text-primary">✓</span>}
        </DropdownMenuItem>

        {/* Worktree entries */}
        {worktrees.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {worktrees
              .filter((wt) => !wt.isMain)
              .map((wt) => (
                <DropdownMenuItem
                  key={wt.path}
                  className="gap-2"
                  onClick={() => setSelectedWorktreePath(wt.path)}
                >
                  <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium truncate max-w-[160px]">{wt.branch}</span>
                    {wt.hasChanges && (
                      <span className="text-xs text-amber-500">
                        {wt.changedFilesCount ?? '?'} changed file(s)
                      </span>
                    )}
                  </div>
                  {selectedWorktreePath === wt.path && (
                    <span className="ml-auto text-xs text-primary">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
