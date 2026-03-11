/**
 * ChatInput — Auto-resizing prompt textarea with a bottom action toolbar.
 *
 * Reads value from PromptInputProvider context (no prop drilling).
 * Enter submits, Shift+Enter inserts a newline.
 * Auto-resizes up to 8 lines; beyond that the textarea scrolls internally.
 * The bottom toolbar houses the actions slot (e.g. model selector) on the
 * left and the submit/stop button on the right.
 *
 * When `slashCommands` is provided, the component renders a SlashCommandDropdown
 * above the input when a slash command is active and intercepts keyboard events
 * for navigation and selection.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { Button } from '../atoms/button.js';
import { usePromptInput } from './prompt-input-context.js';
import { SlashCommandDropdown, type UseSlashCommandsResult } from './slash-command-dropdown.js';

/** Maximum textarea height — 8 lines × ~24 px line-height. */
const MAX_HEIGHT_PX = 192;

export function ChatInput({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask anything...',
  /** Slot for the left side of the bottom toolbar (e.g. model selector). */
  actions,
  className,
  autoFocus,
  slashCommands,
}: {
  /** Called with the trimmed message text when the user submits. */
  onSubmit: (text: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  actions?: React.ReactNode;
  className?: string;
  autoFocus?: boolean;
  /** Optional slash command autocomplete state. Rendered above the textarea when active. */
  slashCommands?: UseSlashCommandsResult;
}) {
  const { value, setValue, clear } = usePromptInput();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDisabled = disabled || isStreaming;
  const canSubmit = value.trim().length > 0 && !isDisabled;
  const commandMode = !!slashCommands?.isActive;

  // Auto-resize up to MAX_HEIGHT_PX; textarea handles its own overflow beyond that.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  // Re-focus after streaming ends so the user can type the next message immediately.
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      textareaRef.current?.focus();
    }
    prevStreamingRef.current = !!isStreaming;
  }, [isStreaming]);

  const handleSubmitInternal = useCallback(() => {
    const text = value.trim();
    if (!text || isDisabled) return;
    onSubmit(text);
    clear();
  }, [value, isDisabled, onSubmit, clear]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When the slash command dropdown is active, intercept navigation keys.
      if (slashCommands?.isActive) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          slashCommands.onNavigate('up');
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          slashCommands.onNavigate('down');
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          const cmd = slashCommands.commands[slashCommands.selectedIndex];
          if (cmd) {
            slashCommands.onSelect(cmd);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          slashCommands.onClose();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmitInternal();
      }
    },
    [handleSubmitInternal, slashCommands]
  );

  return (
    <div
      data-slot="chat-input"
      className={cn(
        'border-t bg-background p-3',
        commandMode ? 'border-primary' : 'border-border',
        className
      )}
    >
      {/* Slash command dropdown — rendered above the textarea when active */}
      <div className="relative">
        {slashCommands?.isActive && <SlashCommandDropdown slashCommands={slashCommands} />}

        {/* Textarea row */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          autoFocus={autoFocus}
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          style={{ maxHeight: MAX_HEIGHT_PX, overflowY: 'auto' }}
        />
      </div>

      {/* Bottom toolbar: actions left, submit/stop right */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">{actions}</div>

        {isStreaming && onStop ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="size-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={handleSubmitInternal}
            disabled={!canSubmit}
            aria-label="Send message"
          >
            <Send className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
