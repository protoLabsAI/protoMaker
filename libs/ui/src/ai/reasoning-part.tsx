/**
 * ReasoningPart — Collapsible thinking/reasoning block for AI messages.
 *
 * Renders the model's reasoning (extended thinking) as a collapsible section.
 * Shows a streaming indicator when the model is still thinking.
 */

import { useState } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';

export interface ReasoningPartProps {
  text: string;
  state?: 'streaming' | 'done';
  className?: string;
}

export function ReasoningPart({ text, state, className }: ReasoningPartProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isStreaming = state === 'streaming';

  // Show first line as preview when collapsed
  const preview = text.split('\n')[0]?.slice(0, 80) || 'Thinking...';

  return (
    <div
      data-slot="reasoning-part"
      className={cn('my-1 rounded-md border border-border/50 bg-muted/30 text-xs', className)}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <Brain
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground',
            isStreaming && 'animate-pulse text-primary'
          )}
        />
        <span className="flex-1 truncate text-muted-foreground">
          {isStreaming ? 'Thinking...' : preview}
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
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
            {text}
            {isStreaming && <span className="animate-pulse">|</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
