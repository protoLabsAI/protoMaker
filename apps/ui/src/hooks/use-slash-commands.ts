/**
 * useSlashCommands — Data layer for chat slash command autocomplete.
 *
 * Fetches the registered command list from GET /api/chat/commands on mount
 * using React Query's stale-while-revalidate pattern, then derives autocomplete
 * state from the current chat input value.
 *
 * Activation rules:
 * - Activates when input starts with '/' and no space has been typed yet.
 * - Stays active (showing the matched command) when input is '/name ' and
 *   'name' exactly matches a registered command (argument-entry mode).
 * - Deactivates when the slash is removed or a space follows an unrecognised prefix.
 *
 * Usage:
 * ```tsx
 * const { commands, isActive, query, selectedIndex, select } =
 *   useSlashCommands(inputValue);
 * ```
 */

import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { SlashCommandSummary } from '@protolabsai/types';

// Commands are effectively static (registered at server start).
// Re-validate after 5 minutes in case the server reloaded skill files.
const COMMANDS_STALE_TIME = 5 * 60 * 1000;

const QUERY_KEY = ['chat', 'commands'] as const;

/** Fetch all registered slash commands from the server. */
async function fetchCommands(): Promise<SlashCommandSummary[]> {
  const client = getHttpApiClient();
  return client.chat.fetchCommands();
}

export interface UseSlashCommandsReturn {
  /** Filtered command list matching the current query. Empty when not active. */
  commands: SlashCommandSummary[];
  /** True when the autocomplete dropdown should be visible. */
  isActive: boolean;
  /** The text typed after the '/' (used for filtering). */
  query: string;
  /** Index of the keyboard-highlighted command (-1 = none). */
  selectedIndex: number;
  /** Set the keyboard-highlighted command by index. */
  select: (index: number) => void;
}

/**
 * @param input - The current raw value of the chat input field.
 */
export function useSlashCommands(input: string): UseSlashCommandsReturn {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Fetch all commands once on mount; revalidate after COMMANDS_STALE_TIME.
  const { data: allCommands = [] } = useQuery<SlashCommandSummary[]>({
    queryKey: QUERY_KEY,
    queryFn: fetchCommands,
    staleTime: COMMANDS_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Derive activation state and query string from the raw input.
  // The dropdown is active only while the user is typing the command name
  // (before any space). Once a space appears, the command is "locked in"
  // and the user is typing arguments — the dropdown closes.
  const { isActive, query } = useMemo<{ isActive: boolean; query: string }>(() => {
    if (!input.startsWith('/')) {
      return { isActive: false, query: '' };
    }

    const afterSlash = input.slice(1);
    const spaceIdx = afterSlash.indexOf(' ');

    if (spaceIdx === -1) {
      // Still typing the command name — autocomplete is active.
      return { isActive: true, query: afterSlash };
    }

    // A space was typed — the user is entering arguments. Close the dropdown.
    return { isActive: false, query: '' };
  }, [input]);

  // Filter commands by case-insensitive substring match on name or description.
  const commands = useMemo<SlashCommandSummary[]>(() => {
    if (!isActive) return [];
    if (!query) return allCommands;

    const lower = query.toLowerCase();
    return allCommands.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower)
    );
  }, [isActive, query, allCommands]);

  const select = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  return { commands, isActive, query, selectedIndex, select };
}
