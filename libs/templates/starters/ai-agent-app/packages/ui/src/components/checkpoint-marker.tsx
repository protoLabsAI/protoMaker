/**
 * CheckpointMarker — Small indicator shown on messages where file changes occurred.
 *
 * Renders a compact badge with a "Rewind to here" button that triggers a
 * session restore to this checkpoint.
 */

import { useState } from 'react';
import { RotateCcw, GitCommit, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointInfo {
  /** Unique checkpoint identifier */
  id: string;
  /** ISO timestamp when the checkpoint was created */
  timestamp: string;
  /** List of files that were changed at this checkpoint */
  files: string[];
}

export interface CheckpointMarkerProps {
  checkpoint: CheckpointInfo;
  /** Called when the user clicks "Rewind to here" */
  onRewind: (checkpointId: string) => Promise<void>;
  className?: string;
}

// ---------------------------------------------------------------------------
// CheckpointMarker
// ---------------------------------------------------------------------------

export function CheckpointMarker({ checkpoint, onRewind, className }: CheckpointMarkerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

  const handleRewind = async () => {
    setIsRewinding(true);
    try {
      await onRewind(checkpoint.id);
    } finally {
      setIsRewinding(false);
    }
  };

  const fileCount = checkpoint.files.length;

  return (
    <div
      data-slot="checkpoint-marker"
      className={cn('my-1 rounded-md border border-amber-500/30 bg-amber-500/5 text-xs', className)}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <GitCommit className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />

        <span className="flex-1 font-medium text-foreground/80">
          {fileCount === 1 ? '1 file changed' : `${fileCount} files changed`}
        </span>

        {/* Expand / collapse file list */}
        <button
          type="button"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setIsOpen((o) => !o)}
          aria-expanded={isOpen}
          aria-label="Toggle file list"
        >
          <ChevronDown className={cn('size-3 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {/* Rewind button */}
        <button
          type="button"
          onClick={() => void handleRewind()}
          disabled={isRewinding}
          className={cn(
            'flex items-center gap-1 rounded px-1.5 py-0.5',
            'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            'hover:bg-amber-500/25 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Rewind to this checkpoint"
        >
          <RotateCcw className={cn('size-3', isRewinding && 'animate-spin')} />
          <span>{isRewinding ? 'Rewinding…' : 'Rewind to here'}</span>
        </button>
      </div>

      {/* Expanded file list */}
      {isOpen && fileCount > 0 && (
        <div className="border-t border-amber-500/20 px-2.5 py-2">
          <ul className="space-y-0.5">
            {checkpoint.files.map((file) => (
              <li key={file} className="font-mono text-[11px] text-foreground/70 truncate">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
