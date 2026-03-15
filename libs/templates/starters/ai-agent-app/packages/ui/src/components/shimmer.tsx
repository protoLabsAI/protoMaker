/**
 * ShimmerLoader — Skeleton placeholder shown at the bottom of ChatMessageList
 * while a new assistant response is pending.
 */

import { cn } from '../lib/utils.js';

export interface ShimmerLoaderProps {
  className?: string;
}

export function ShimmerLoader({ className }: ShimmerLoaderProps) {
  return (
    <div
      data-slot="shimmer-loader"
      className={cn('flex gap-3 px-4 py-2', className)}
      role="status"
      aria-label="Loading response"
    >
      {/* Avatar placeholder */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary animate-pulse" />

      {/* Bubble skeleton */}
      <div className="flex flex-col gap-2 max-w-[85%] w-full">
        {/* Line 1 — full width */}
        <div
          className="h-3 rounded-full animate-pulse"
          style={{
            background:
              'linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground) / 0.15) 50%, hsl(var(--muted)) 100%)',
            backgroundSize: '200% 100%',
            width: '75%',
          }}
        />
        {/* Line 2 — shorter */}
        <div
          className="h-3 rounded-full animate-pulse"
          style={{
            background:
              'linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground) / 0.15) 50%, hsl(var(--muted)) 100%)',
            backgroundSize: '200% 100%',
            width: '55%',
          }}
        />
        {/* Line 3 — shortest */}
        <div
          className="h-3 rounded-full animate-pulse"
          style={{
            background:
              'linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground) / 0.15) 50%, hsl(var(--muted)) 100%)',
            backgroundSize: '200% 100%',
            width: '40%',
          }}
        />
      </div>
    </div>
  );
}
