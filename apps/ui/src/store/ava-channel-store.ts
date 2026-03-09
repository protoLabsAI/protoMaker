/**
 * Ava Channel Store — append-only message stream for private Ava-to-Ava coordination.
 *
 * This is a separate Zustand store — NOT an extension of chat-store.
 * Different data model: append-only stream vs bidirectional chat sessions.
 * Different source: CRDT/API vs AI SDK.
 *
 * Messages are fetched from /api/ava-channel/messages and can be appended
 * in real-time via the appendMessage action (called by WebSocket event handlers).
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import type { AvaChatMessage } from '@protolabsai/types';
import { apiFetch } from '@/lib/api-fetch';
import { getHttpApiClient } from '@/lib/http-api-client';

// ============================================================================
// Types
// ============================================================================

export type AvaChannelTab = 'ask-ava' | 'ava-channel';

interface AvaChannelState {
  messages: AvaChatMessage[];
  loading: boolean;
  error: string | null;
  /** Whether hivemind (multi-instance) mode is detected as active */
  hivemindActive: boolean;
  /** Last active tab — persisted so keyboard shortcut restores it */
  lastActiveTab: AvaChannelTab;
  /** Filter string for searching within the channel */
  filterQuery: string;
}

interface AvaChannelActions {
  fetchMessages: (options?: {
    limit?: number;
    since?: string;
    includeProtocol?: boolean;
  }) => Promise<void>;
  appendMessage: (message: AvaChatMessage) => void;
  sendOperatorMessage: (content: string) => Promise<void>;
  setHivemindActive: (active: boolean) => void;
  setLastActiveTab: (tab: AvaChannelTab) => void;
  setFilterQuery: (query: string) => void;
  clearMessages: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useAvaChannelStore = create<AvaChannelState & AvaChannelActions>()((set) => ({
  messages: [],
  loading: false,
  error: null,
  hivemindActive: false,
  lastActiveTab: 'ask-ava',
  filterQuery: '',

  fetchMessages: async (options = {}) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (options.since) params.set('since', options.since);
      if (options.includeProtocol) params.set('includeProtocol', 'true');

      const response = await apiFetch(`/api/ava-channel/messages?${params.toString()}`, 'GET');

      if (!response.ok) {
        const data = (await response.json()) as { error?: { message?: string } };
        set({
          loading: false,
          error: data.error?.message ?? `HTTP ${response.status}`,
        });
        return;
      }

      const data = (await response.json()) as {
        success: boolean;
        messages?: AvaChatMessage[];
      };

      if (data.success && data.messages) {
        set({ messages: data.messages, loading: false, hivemindActive: true });
      } else {
        set({ loading: false, hivemindActive: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load messages';
      set({ loading: false, error: message });
    }
  },

  appendMessage: (message) => {
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      return { messages: [...state.messages, message] };
    });
  },

  sendOperatorMessage: async (content: string) => {
    try {
      const response = await apiFetch('/api/ava-channel/send', 'POST', {
        body: { message: content, instanceId: 'operator' },
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: { message?: string } };
        set({ error: data.error?.message ?? 'Failed to send message' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      set({ error: message });
    }
  },

  setHivemindActive: (active) => set({ hivemindActive: active }),
  setLastActiveTab: (tab) => set({ lastActiveTab: tab }),
  setFilterQuery: (query) => set({ filterQuery: query }),
  clearMessages: () => set({ messages: [], error: null }),
}));

export function useAvaChannelLiveUpdates(): void {
  const appendMessage = useAvaChannelStore((s) => s.appendMessage);

  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type, payload) => {
      if ((type as string) !== 'ava-channel:message') return;
      const data = payload as { message?: AvaChatMessage } | null;
      if (data?.message) {
        appendMessage(data.message);
      }
    });
    return unsubscribe;
  }, [appendMessage]);
}
