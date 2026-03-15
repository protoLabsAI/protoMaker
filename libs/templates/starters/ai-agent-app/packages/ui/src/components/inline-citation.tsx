/**
 * InlineCitation — Numbered badge with hover popover for cited entities.
 *
 * Rendered inline within assistant message text wherever a [[type:id]] citation
 * marker appears. Shows a numbered superscript badge; hovering reveals a popover
 * with the entity's title, type, and status.
 *
 * Graceful fallback: if the server could not resolve the citation (citation prop
 * is undefined), renders the raw id as the title.
 */

import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';

export interface Citation {
  id: string;
  type: 'feature' | 'doc';
  title: string;
  url?: string;
  path?: string;
  status?: string;
}

export interface InlineCitationProps {
  /** 1-based display index shown in the badge */
  index: number;
  /** Citation type extracted from the pattern ("feature" | "doc") */
  type: string;
  /** Raw ID from the [[type:id]] pattern */
  id: string;
  /** Server-resolved citation metadata (undefined = graceful fallback) */
  citation?: Citation;
}

export function InlineCitation({ index, type, id, citation }: InlineCitationProps) {
  const displayTitle = citation?.title ?? id;
  const displayStatus = citation?.status;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          data-slot="inline-citation"
          role="button"
          tabIndex={0}
          className="mx-0.5 inline-flex cursor-pointer select-none items-center justify-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary transition-colors hover:bg-primary/25"
          aria-label={`Citation ${index}: ${displayTitle}`}
        >
          {index}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" side="top" sideOffset={6}>
        <div className="flex flex-col gap-2">
          {/* Type + Status badges */}
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              {type}
            </span>
            {displayStatus && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                {displayStatus}
              </span>
            )}
          </div>

          {/* Entity title */}
          <p className="text-sm font-medium leading-tight">{displayTitle}</p>

          {/* Path for doc citations */}
          {citation?.path && <p className="text-[11px] text-muted-foreground">{citation.path}</p>}

          {/* Fallback notice when citation was not resolved */}
          {!citation && (
            <p className="text-[11px] text-muted-foreground/70">
              ID: <span className="font-mono">{id}</span>
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
