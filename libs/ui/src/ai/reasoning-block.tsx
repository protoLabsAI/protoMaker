/**
 * ReasoningBlock — Collapsible card for Claude's extended thinking output.
 *
 * Shows a 'Thinking...' header with shimmer animation while streaming.
 * Auto-expands while active so the user can see reasoning in progress.
 * Collapses and shows 'Thought for X.Xs' when reasoning completes.
 * The user can toggle open/closed at any time after completion.
 */

import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import { formatDuration } from '@protolabsai/utils/format-time';
import { cn } from '../lib/utils.js';

export interface ReasoningBlockProps {
  text: string;
  state?: 'streaming' | 'done';
  className?: string;
}

export function ReasoningBlock({ text, state, className }: ReasoningBlockProps) {
  const startTimeRef = useRef<number>(Date.now());
  const [durationMs, setDurationMs] = useState<number | undefined>();
  const isStreaming = state === 'streaming';

  // Auto-expand while streaming; collapse when done (user can re-open)
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Record duration when streaming completes and collapse
  useEffect(() => {
    if (state === 'done' && durationMs === undefined) {
      setDurationMs(Date.now() - startTimeRef.current);
      setIsOpen(false);
    }
  }, [state, durationMs]);

  // Expand when streaming starts (handles cases where state transitions to streaming)
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  const summaryText =
    state === 'done' && durationMs !== undefined
      ? `Thought for ${formatDuration(durationMs)}`
      : 'Thinking...';

  return (
    <div
      data-slot="reasoning-block"
      className={cn('my-1 rounded-md border border-border/50 bg-muted/30 text-xs', className)}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <Brain
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground',
            isStreaming && 'animate-pulse text-primary'
          )}
        />
        <span
          className={cn('flex-1 truncate text-muted-foreground', isStreaming && 'animate-pulse')}
        >
          {summaryText}
        </span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="border-t border-border/50 px-2.5 py-2">
          <p
            className={cn(
              'leading-relaxed text-foreground/70 whitespace-pre-wrap',
              isStreaming && 'animate-pulse'
            )}
          >
            {text}
          </p>
        </div>
      )}
    </div>
  );
}
