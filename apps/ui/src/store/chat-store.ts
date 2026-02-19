/**
 * Chat Store — Persistent conversation management for Ava chat.
 *
 * Stores conversation sessions with messages in localStorage via Zustand persist.
 * Messages are stored as serializable snapshots compatible with AI SDK's UIMessage.
 * Both the sidebar and overlay share this store for unified conversation history.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UIMessage } from 'ai';

// ============================================================================
// Types
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  modelAlias: string;
  messages: UIMessage[];
  createdAt: number; // epoch ms (serializable)
  updatedAt: number;
}

// ============================================================================
// State + Actions
// ============================================================================

interface ChatStoreState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  historyOpen: boolean;
}

interface ChatActions {
  createSession: (modelAlias?: string) => ChatSession;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  saveMessages: (id: string, messages: UIMessage[]) => void;
  updateTitle: (id: string, title: string) => void;
  updateModel: (id: string, modelAlias: string) => void;
  setHistoryOpen: (open: boolean) => void;
  toggleHistory: () => void;
  getCurrentSession: () => ChatSession | null;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Auto-generate a title from the first user message */
export function autoTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  // Extract text content
  const text =
    firstUser.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || '';
  if (!text) return 'New chat';
  return text.length > 50 ? text.slice(0, 47) + '...' : text;
}

// ============================================================================
// Store
// ============================================================================

const MAX_SESSIONS = 50;

export const useChatStore = create<ChatStoreState & ChatActions>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      historyOpen: false,

      createSession: (modelAlias = 'sonnet') => {
        const now = Date.now();
        const session: ChatSession = {
          id: generateId(),
          title: 'New chat',
          modelAlias,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };

        const sessions = [session, ...get().sessions];
        // Cap stored sessions
        if (sessions.length > MAX_SESSIONS) {
          sessions.length = MAX_SESSIONS;
        }

        set({ sessions, currentSessionId: session.id });
        return session;
      },

      deleteSession: (id) => {
        const state = get();
        const sessions = state.sessions.filter((s) => s.id !== id);
        const currentSessionId =
          state.currentSessionId === id ? (sessions[0]?.id ?? null) : state.currentSessionId;
        set({ sessions, currentSessionId });
      },

      switchSession: (id) => {
        set({ currentSessionId: id });
      },

      saveMessages: (id, messages) => {
        const sessions = get().sessions.map((s) =>
          s.id === id
            ? {
                ...s,
                messages,
                updatedAt: Date.now(),
                // Auto-title on first user message if still default
                title: s.title === 'New chat' ? autoTitle(messages) : s.title,
              }
            : s
        );
        set({ sessions });
      },

      updateTitle: (id, title) => {
        const sessions = get().sessions.map((s) =>
          s.id === id ? { ...s, title, updatedAt: Date.now() } : s
        );
        set({ sessions });
      },

      updateModel: (id, modelAlias) => {
        const sessions = get().sessions.map((s) =>
          s.id === id ? { ...s, modelAlias, updatedAt: Date.now() } : s
        );
        set({ sessions });
      },

      setHistoryOpen: (open) => set({ historyOpen: open }),
      toggleHistory: () => set({ historyOpen: !get().historyOpen }),

      getCurrentSession: () => {
        const state = get();
        return state.sessions.find((s) => s.id === state.currentSessionId) ?? null;
      },
    }),
    {
      name: 'ava-chat-sessions',
      version: 1,
      // Only persist sessions and currentSessionId, not UI state
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);
