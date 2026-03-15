/**
 * MessageBranches — Compact branch navigation bar for assistant messages.
 *
 * Renders a "< 2/3 >" nav bar when an assistant message has multiple branch
 * variants (e.g., from repeated regenerations). Renders nothing when
 * branchCount <= 1, so callers can always mount this component safely.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from '../ui/button.js';

export interface MessageBranchesProps {
  /** Zero-based index of the currently displayed branch. */
  branchIndex: number;
  /** Total number of branch variants. Component renders null when <= 1. */
  branchCount: number;
  /** Called when the user clicks the Previous (left) chevron. */
  onPrevious: () => void;
  /** Called when the user clicks the Next (right) chevron. */
  onNext: () => void;
  className?: string;
}

export function MessageBranches({
  branchIndex,
  branchCount,
  onPrevious,
  onNext,
  className,
}: MessageBranchesProps) {
  if (branchCount <= 1) return null;

  return (
    <div
      data-slot="message-branches"
      className={cn('flex items-center gap-0.5 text-xs text-muted-foreground', className)}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onPrevious}
        disabled={branchIndex === 0}
        aria-label="Previous branch"
        className="size-5"
      >
        <ChevronLeft className="size-3" />
      </Button>
      <span className="select-none tabular-nums">
        {branchIndex + 1}/{branchCount}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onNext}
        disabled={branchIndex === branchCount - 1}
        aria-label="Next branch"
        className="size-5"
      >
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
