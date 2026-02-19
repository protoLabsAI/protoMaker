/**
 * Slash Command List — floating popup rendered by @tiptap/suggestion
 *
 * Shows filtered commands with keyboard navigation (Arrow Up/Down, Enter, Escape).
 */

import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import type { SlashCommandItem } from './extensions/slash-commands';

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        if (event.key === 'Escape') {
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-popover p-2 shadow-lg">
          <p className="px-2 py-1 text-xs text-muted-foreground">No results</p>
        </div>
      );
    }

    return (
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors ${
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded bg-muted text-xs">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.label}</div>
              <div className="truncate text-xs text-muted-foreground">{item.description}</div>
            </div>
            {item.category === 'ai' && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                AI
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }
);

SlashCommandList.displayName = 'SlashCommandList';
