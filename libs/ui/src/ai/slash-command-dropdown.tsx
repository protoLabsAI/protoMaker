/**
 * SlashCommandDropdown — floating command palette rendered above ChatInput.
 *
 * Rendered when useSlashCommands.isActive is true.
 * Shows filtered commands with name, description, source badge, and argument hint.
 * Supports keyboard navigation (ArrowUp / ArrowDown / Enter / Escape).
 * Positioned anchored above the input; viewport overflow is prevented via
 * `max-h` + overflow-y scroll.
 *
 * Usage:
 *   <div className="relative">
 *     {slashCommands.isActive && (
 *       <SlashCommandDropdown slashCommands={slashCommands} />
 *     )}
 *     <ChatInput ... />
 *   </div>
 */

import { useEffect, useRef, useCallback } from 'react';
import { cn } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlashCommand {
  /** The command name including the leading slash, e.g. "/help". */
  name: string;
  /** Short description shown below the name. */
  description: string;
  /** Badge label indicating the command source (e.g. "built-in", "plugin"). */
  source: string;
  /** Optional argument hint shown after the command, e.g. "[query]". */
  argHint?: string;
}

/**
 * Shape returned by a `useSlashCommands` hook (or compatible object).
 * The dropdown is a pure presentational component — all state lives here.
 */
export interface UseSlashCommandsResult {
  /** Whether the dropdown is currently active/visible. */
  isActive: boolean;
  /** The filtered list of commands to display. */
  commands: SlashCommand[];
  /** Index of the currently highlighted command. */
  selectedIndex: number;
  /** Called when the user confirms a selection (click or Enter). */
  onSelect: (command: SlashCommand) => void;
  /** Called when the user dismisses the dropdown (Escape or click-outside). */
  onClose: () => void;
  /** Called to move the selection up or down. */
  onNavigate: (direction: 'up' | 'down') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SlashCommandDropdownProps {
  slashCommands: UseSlashCommandsResult;
  className?: string;
}

export function SlashCommandDropdown({ slashCommands, className }: SlashCommandDropdownProps) {
  const { commands, selectedIndex, onSelect, onClose, onNavigate } = slashCommands;

  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll the highlighted item into view whenever selectedIndex changes.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard navigation handler — consumers forward keyboard events to this.
  // Attach it to a keydown listener on the associated textarea, e.g.:
  //   onKeyDown={(e) => dropdownRef.current?.handleKeyDown(e)}
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onNavigate('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNavigate('down');
          break;
        case 'Enter': {
          e.preventDefault();
          const cmd = commands[selectedIndex];
          if (cmd) onSelect(cmd);
          break;
        }
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [commands, selectedIndex, onSelect, onClose, onNavigate]
  );

  // Expose keyboard handler on the DOM node so integrators can forward events.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    (el as HTMLDivElement & { handleKeyDown?: typeof handleKeyDown }).handleKeyDown = handleKeyDown;
  }, [handleKeyDown]);

  if (commands.length === 0) {
    return (
      <div
        data-slot="slash-command-dropdown"
        role="listbox"
        aria-label="Slash commands"
        className={cn(
          'absolute bottom-full left-0 right-0 z-50 mb-1',
          'rounded-lg border border-border bg-popover shadow-lg',
          'p-2',
          className
        )}
      >
        <p className="px-2 py-1 text-xs text-muted-foreground">No matching commands</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      data-slot="slash-command-dropdown"
      role="listbox"
      aria-label="Slash commands"
      className={cn(
        'absolute bottom-full left-0 right-0 z-50 mb-1',
        'max-h-64 overflow-y-auto',
        'rounded-lg border border-border bg-popover shadow-lg',
        'p-1',
        className
      )}
    >
      {commands.map((cmd, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={cmd.name}
            ref={isSelected ? selectedRef : undefined}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(cmd)}
            className={cn(
              'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
              isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'
            )}
          >
            {/* Command name + arg hint */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate font-medium">{cmd.name}</span>
                {cmd.argHint && (
                  <span className="shrink-0 text-xs text-muted-foreground">{cmd.argHint}</span>
                )}
              </div>
              {cmd.description && (
                <div className="truncate text-xs text-muted-foreground">{cmd.description}</div>
              )}
            </div>

            {/* Source badge */}
            <span
              className={cn(
                'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                'bg-muted text-muted-foreground'
              )}
            >
              {cmd.source}
            </span>
          </button>
        );
      })}
    </div>
  );
}
