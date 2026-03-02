import { Bug, BookOpen, Plus, FolderOpen, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickActionsBarProps {
  onBugReport: () => void;
  onDocs: () => void;
  onNewProject: () => void;
  onOpenFolder: () => void;
  onSettings: () => void;
  onClose: () => void;
}

const actions = [
  { key: 'new', icon: Plus, label: 'New Project', testId: 'quick-action-new' },
  { key: 'open', icon: FolderOpen, label: 'Open Folder', testId: 'quick-action-open' },
  { key: 'docs', icon: BookOpen, label: 'Documentation', testId: 'quick-action-docs' },
  { key: 'bug', icon: Bug, label: 'Report Bug', testId: 'quick-action-bug' },
  { key: 'settings', icon: Settings, label: 'Global Settings', testId: 'quick-action-settings' },
] as const;

export function QuickActionsBar({
  onBugReport,
  onDocs,
  onNewProject,
  onOpenFolder,
  onSettings,
  onClose,
}: QuickActionsBarProps) {
  const handlers: Record<string, () => void> = {
    bug: onBugReport,
    docs: onDocs,
    new: onNewProject,
    open: onOpenFolder,
    settings: onSettings,
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border/30">
      {actions.map(({ key, icon: Icon, label, testId }) => (
        <button
          key={key}
          onClick={handlers[key]}
          className={cn(
            'flex items-center justify-center size-8 rounded-lg',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-accent/50',
            'transition-all duration-200',
            'active:scale-95'
          )}
          title={label}
          data-testid={testId}
        >
          <Icon className="size-4" />
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={onClose}
        className={cn(
          'flex items-center justify-center size-8 rounded-lg',
          'text-muted-foreground hover:text-foreground',
          'hover:bg-muted/50',
          'transition-colors duration-150'
        )}
        aria-label="Close sidebar"
        data-testid="sidebar-close"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
