import { useMemo } from 'react';
import type { SuggestionItem } from '@protolabs-ai/ui/ai';
import type { Feature } from '@/store/types';

const DEFAULT_SUGGESTIONS: SuggestionItem[] = [
  { label: 'Board status', value: 'What is the current board status?' },
  { label: "What's running?", value: 'Which agents are currently running?' },
  { label: 'Recent activity', value: 'Summarize recent activity on this project' },
  { label: 'Any blockers?', value: 'Are there any blocked features I should know about?' },
];

/**
 * Returns up to 4 contextual suggestion pills for the overlay empty state.
 * Prioritizes board state (blocked, in-progress, failed features) when available,
 * filling remaining slots from the default suggestions.
 */
export function useContextualSuggestions(features: Feature[]): SuggestionItem[] {
  return useMemo(() => {
    if (!features.length) return DEFAULT_SUGGESTIONS;

    const suggestions: SuggestionItem[] = [];
    const blocked = features.filter((f) => f.status === 'blocked');
    const running = features.filter(
      (f) => f.status === 'in_progress' || (f.status as string) === 'running'
    );
    const failed = features.filter((f) => (f.failureCount ?? 0) > 0);

    if (blocked.length) {
      suggestions.push({
        label: `Why is "${blocked[0].title}" blocked?`,
        value: `Why is the feature "${blocked[0].title}" blocked?`,
      });
    }
    if (running.length) {
      suggestions.push({
        label: `What is "${running[0].title}" doing?`,
        value: `What is the agent working on for "${running[0].title}"?`,
      });
    }
    if (failed.length) {
      suggestions.push({
        label: `What failed on "${failed[0].title}"?`,
        value: `Explain the last failure on "${failed[0].title}"`,
      });
    }

    const remaining = DEFAULT_SUGGESTIONS.slice(0, Math.max(0, 4 - suggestions.length));
    return [...suggestions, ...remaining].slice(0, 4);
  }, [features]);
}
