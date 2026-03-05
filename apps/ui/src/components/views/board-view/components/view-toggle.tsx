import { LayoutGrid, List, BookOpen, Brain, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'kanban' | 'list' | 'prs' | 'context' | 'memory';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

const buttonClass =
  'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function toggleBtnClass(active: boolean) {
  return cn(
    buttonClass,
    active
      ? 'bg-primary text-primary-foreground shadow-md'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  );
}

/**
 * A segmented control component for switching between board view modes.
 */
export function ViewToggle({ viewMode, onViewModeChange, className }: ViewToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-md bg-muted p-[3px] border border-border',
        className
      )}
      role="tablist"
      aria-label="View mode"
    >
      <button
        role="tab"
        aria-selected={viewMode === 'kanban'}
        aria-label="Kanban view"
        onClick={() => onViewModeChange('kanban')}
        className={toggleBtnClass(viewMode === 'kanban')}
        data-testid="view-toggle-kanban"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="sr-only">Kanban</span>
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'list'}
        aria-label="List view"
        onClick={() => onViewModeChange('list')}
        className={toggleBtnClass(viewMode === 'list')}
        data-testid="view-toggle-list"
      >
        <List className="w-4 h-4" />
        <span className="sr-only">List</span>
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'prs'}
        aria-label="Pull Requests view"
        onClick={() => onViewModeChange('prs')}
        className={toggleBtnClass(viewMode === 'prs')}
        data-testid="view-toggle-prs"
      >
        <GitPullRequest className="w-4 h-4" />
        <span className="sr-only">Pull Requests</span>
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'context'}
        aria-label="Context view"
        onClick={() => onViewModeChange('context')}
        className={toggleBtnClass(viewMode === 'context')}
        data-testid="view-toggle-context"
      >
        <BookOpen className="w-4 h-4" />
        <span className="sr-only">Context</span>
      </button>
      <button
        role="tab"
        aria-selected={viewMode === 'memory'}
        aria-label="Memory view"
        onClick={() => onViewModeChange('memory')}
        className={toggleBtnClass(viewMode === 'memory')}
        data-testid="view-toggle-memory"
      >
        <Brain className="w-4 h-4" />
        <span className="sr-only">Memory</span>
      </button>
    </div>
  );
}
