/**
 * Suggestion — Quick-action pill buttons for common prompts.
 *
 * Renders a horizontal scroll of suggestion buttons.
 * Pure presentational — the parent decides what happens on click.
 */

import { cn } from '../lib/utils.js';
import { Button } from '../ui/button.js';

export interface SuggestionItem {
  label: string;
  value: string;
}

export function SuggestionList({
  suggestions,
  onSelect,
  className,
}: {
  suggestions: SuggestionItem[];
  onSelect: (value: string) => void;
  className?: string;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div data-slot="suggestion-list" className={cn('flex flex-wrap gap-2 px-4 py-2', className)}>
      {suggestions.map((item) => (
        <Button
          key={item.value}
          variant="outline"
          size="sm"
          className="h-7 rounded-full text-xs"
          onClick={() => onSelect(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
