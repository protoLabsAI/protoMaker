/**
 * MessageActions — Compact icon-button toolbar rendered per message bubble.
 *
 * Provides Copy, Regenerate, ThumbsUp, and ThumbsDown actions.
 * - Copy: writes bubble text to clipboard and shows a transient Check icon confirmation.
 * - Regenerate: calls onRegenerate callback.
 * - ThumbsUp/ThumbsDown: calls onFeedback callback with 'up' or 'down' rating.
 */

import { useState } from 'react';
import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from '../ui/button.js';

export type FeedbackRating = 'up' | 'down';

export interface MessageActionsProps {
  /** Text content to copy to clipboard. */
  text: string;
  /** Called when the user clicks the Regenerate button. */
  onRegenerate?: () => void;
  /** Called when the user clicks ThumbsUp or ThumbsDown. */
  onFeedback?: (rating: FeedbackRating) => void;
  className?: string;
}

export function MessageActions({ text, onRegenerate, onFeedback, className }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available — silently fail
    }
  };

  return (
    <div data-slot="message-actions" className={cn('flex items-center gap-0.5', className)}>
      {/* Copy */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy message'}
        title={copied ? 'Copied!' : 'Copy'}
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </Button>

      {/* Regenerate */}
      {onRegenerate && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRegenerate}
          aria-label="Regenerate response"
          title="Regenerate"
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      )}

      {/* ThumbsUp */}
      {onFeedback && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onFeedback('up')}
          aria-label="Thumbs up"
          title="Good response"
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <ThumbsUp className="size-3.5" />
        </Button>
      )}

      {/* ThumbsDown */}
      {onFeedback && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onFeedback('down')}
          aria-label="Thumbs down"
          title="Bad response"
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <ThumbsDown className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
