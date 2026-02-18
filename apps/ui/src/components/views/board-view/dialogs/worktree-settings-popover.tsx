import { Popover, PopoverContent, PopoverTrigger } from '@protolabs/ui/atoms';
import { Label } from '@protolabs/ui/atoms';
import { Switch } from '@protolabs/ui/atoms';
import { GitBranch, Settings2 } from 'lucide-react';

interface WorktreeSettingsPopoverProps {
  addFeatureUseSelectedWorktreeBranch: boolean;
  onAddFeatureUseSelectedWorktreeBranchChange: (value: boolean) => void;
}

export function WorktreeSettingsPopover({
  addFeatureUseSelectedWorktreeBranch,
  onAddFeatureUseSelectedWorktreeBranchChange,
}: WorktreeSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1 rounded hover:bg-accent/50 transition-colors"
          title="Worktree Settings"
          data-testid="worktree-settings-button"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end" sideOffset={8}>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm mb-1">Worktree Settings</h4>
            <p className="text-xs text-muted-foreground">
              Configure how worktrees affect feature creation.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-secondary/50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <GitBranch className="w-4 h-4 text-brand-500 shrink-0" />
              <Label
                htmlFor="worktree-branch-toggle"
                className="text-xs font-medium cursor-pointer"
              >
                Default to worktree mode
              </Label>
            </div>
            <Switch
              id="worktree-branch-toggle"
              checked={addFeatureUseSelectedWorktreeBranch}
              onCheckedChange={onAddFeatureUseSelectedWorktreeBranchChange}
              data-testid="worktree-branch-toggle"
            />
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            New features will automatically use isolated worktrees, keeping changes separate from
            your main branch until you're ready to merge.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
