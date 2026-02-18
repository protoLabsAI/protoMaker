/**
 * ChatInput — Prompt input area with auto-resize textarea and submit button.
 *
 * Handles Enter to submit (Shift+Enter for newline).
 * Includes model selector and stop button during streaming.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@protolabs/ui/atoms';
import { cn } from '@/lib/utils';
import { ChatModelSelect } from './chat-model-select';

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  modelAlias,
  onModelChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  modelAlias: string;
  onModelChange: (value: string) => void;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDisabled = disabled || isStreaming;
  const canSubmit = value.trim().length > 0 && !isDisabled;

  // Auto-resize textarea
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
          placeholder="Ask anything..."
          disabled={isDisabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        {isStreaming ? (
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onStop}>
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <ChatModelSelect value={modelAlias} onValueChange={onModelChange} />
        <span className="text-[10px] text-muted-foreground">
          {isStreaming ? 'Streaming...' : 'Enter to send'}
        </span>
      </div>
    </div>
  );
}
