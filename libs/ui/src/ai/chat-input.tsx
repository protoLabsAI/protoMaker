/**
 * ChatInput — Auto-resizing prompt textarea with submit/stop controls.
 *
 * Handles Enter to submit (Shift+Enter for newline).
 * Pure presentational — no business logic, no API knowledge.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from '../atoms/button.js';

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask anything...',
  actions,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Optional slot for extra controls (e.g. model selector) rendered below the input */
  actions?: React.ReactNode;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDisabled = disabled || isStreaming;
  const canSubmit = value.trim().length > 0 && !isDisabled;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }
    },
    [canSubmit, onSubmit]
  );

  return (
    <div
      data-slot="chat-input"
      className={cn('border-t border-border bg-background p-3', className)}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        {isStreaming && onStop ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
      {actions && <div className="mt-1 flex items-center justify-between">{actions}</div>}
    </div>
  );
}
