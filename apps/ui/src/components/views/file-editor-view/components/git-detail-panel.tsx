import { GitCommit, User, Clock } from 'lucide-react';
import type { GitFileDetailsInfo } from '../use-file-editor-store';

interface GitDetailPanelProps {
  details: GitFileDetailsInfo | null;
}

function formatRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return isoDate;
  }
}

export function GitDetailPanel({ details }: GitDetailPanelProps) {
  if (!details) return null;

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-border/40 bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground overflow-hidden">
      <span className="flex items-center gap-1 shrink-0">
        <GitCommit className="size-3" />
        <span className="font-mono">{details.shortHash}</span>
      </span>
      <span className="truncate max-w-[40%]" title={details.message}>
        {details.message}
      </span>
      <span className="flex items-center gap-1 shrink-0 ml-auto">
        <User className="size-3" />
        {details.author}
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <Clock className="size-3" />
        {formatRelativeTime(details.isoDate)}
      </span>
    </div>
  );
}
