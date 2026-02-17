/**
 * Suggestion Queue - Shows top 5 Twitch chat suggestions
 *
 * Displays suggestions from !idea commands with vote counts.
 */

import type { TwitchSuggestion } from '@automaker/types';

interface SuggestionQueueProps {
  suggestions: TwitchSuggestion[];
}

export function SuggestionQueue({ suggestions }: SuggestionQueueProps) {
  const topSuggestions = suggestions.slice(0, 5);

  return (
    <div className="h-full flex flex-col bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="bg-purple-900/80 px-4 py-3 border-b border-purple-700/50">
        <div className="text-lg font-bold text-purple-200">Suggestion Queue</div>
        <div className="text-xs text-purple-300 mt-0.5">From Twitch Chat</div>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {topSuggestions.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No suggestions yet. Use !idea in chat!
          </div>
        ) : (
          topSuggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-purple-700/50 rounded-full flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white break-words">
                    {suggestion.suggestion}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">by @{suggestion.username}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
