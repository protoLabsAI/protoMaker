/**
 * MessageSources — Collapsible list of citations below an assistant message.
 *
 * Rendered after the message bubble when the message contains one or more
 * resolved citations. Each entry shows the citation number, entity title,
 * type, and optional status — mirroring the inline badge popovers.
 *
 * Defaults to open when 3 or fewer sources, collapsed when more than 3.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';
import type { Citation } from './inline-citation.js';

export interface MessageSourcesProps {
  citations: Citation[];
}

export function MessageSources({ citations }: MessageSourcesProps) {
  const [isOpen, setIsOpen] = useState(citations.length <= 3);

  if (citations.length === 0) return null;

  return (
    <div data-slot="message-sources" className="mt-2 border-t border-border/30 pt-2">
      <button
        type="button"
        className="mb-1.5 flex w-full items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <ChevronDown
          className={cn('size-3 shrink-0 transition-transform', !isOpen && '-rotate-90')}
        />
        Sources ({citations.length})
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1">
          {citations.map((citation, i) => (
            <div key={`${citation.type}:${citation.id}`} className="flex items-start gap-2">
              {/* Number badge — matches the InlineCitation badge style */}
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                {i + 1}
              </span>

              <div className="flex flex-col min-w-0">
                <span className="truncate text-xs font-medium leading-snug">
                  {citation.title || citation.id}
                </span>
                <span className="text-[10px] capitalize text-muted-foreground">
                  {citation.type}
                  {citation.status ? ` · ${citation.status}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
