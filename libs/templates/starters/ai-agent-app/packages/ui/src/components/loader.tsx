/**
 * AILoader — Animated processing state indicator for assistant messages.
 *
 * Renders an animated dot-pulse loading indicator with an optional step count.
 */

import { cn } from '../lib/utils.js';

export interface AILoaderProps {
  /** Current agentic step number (1-based). If provided, shows "Step N" label. */
  stepCount?: number;
  /** Custom label text to show beside the dots. Defaults to "Step {stepCount}". */
  label?: string;
  className?: string;
}

export function AILoader({ stepCount, label, className }: AILoaderProps) {
  const displayLabel = label ?? (stepCount !== undefined ? `Step ${stepCount}` : undefined);

  return (
    <div
      data-slot="ai-loader"
      className={cn('flex items-center gap-2 text-[11px] text-muted-foreground', className)}
      aria-label={displayLabel ?? 'Loading'}
      role="status"
    >
      {/* Dot-pulse animation */}
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        <span
          className="size-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '1s' }}
        />
        <span
          className="size-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: '150ms', animationDuration: '1s' }}
        />
        <span
          className="size-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: '300ms', animationDuration: '1s' }}
        />
      </span>

      {displayLabel && <span>{displayLabel}</span>}
    </div>
  );
}
