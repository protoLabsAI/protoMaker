/**
 * session-store — Persistent chat session management.
 *
 * Stores conversation sessions with messages in localStorage via Zustand persist.
 * Enforces a max of 50 sessions with LRU eviction (oldest updatedAt removed first).
 * Messages are stored as serializable UIMessage snapshots compatible with AI SDK.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UIMessage } from 'ai';

// ============================================================================
// Types
// ============================================================================

export interface ChatSession {
  id: string;
  /** Display title, auto-generated from the first user message. */
  title: string;
  /** AI model identifier, e.g. "claude-haiku-4-5-20251001" */
  model: string;
  messages: UIMessage[];
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms — used for LRU eviction ordering
}

interface SessionStoreState {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

interface SessionActions {
  /** Create a new session and make it current. Returns the new session. */
  createSession: (model?: string) => ChatSession;
  /** Permanently remove a session. */
  deleteSession: (id: string) => void;
  /** Switch the active session. */
  switchSession: (id: string) => void;
  /** Persist updated messages for a session. Auto-titles on first user message. */
  saveMessages: (id: string, messages: UIMessage[]) => void;
  /** Update the model for a session. */
  updateModel: (id: string, model: string) => void;
  /** Update the display title. */
  updateTitle: (id: string, title: string) => void;
  /** Return the current session or null. */
  getCurrentSession: () => ChatSession | null;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Derive a short title from the first user message. */
export function autoTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  const text =
    firstUser.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') ?? '';
  if (!text) return 'New chat';
  return text.length > 50 ? `${text.slice(0, 47)}...` : text;
}

// ============================================================================
// Store
// ============================================================================

const MAX_SESSIONS = 50;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export const useSessionStore = create<SessionStoreState & SessionActions>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

      createSession: (model = DEFAULT_MODEL) => {
        const now = Date.now();
        const session: ChatSession = {
          id: generateId(),
          title: 'New chat',
          model,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };

        // Prepend new session (most recent first), then LRU-evict if over cap
        const sessions = [session, ...get().sessions];
        if (sessions.length > MAX_SESSIONS) {
          // Sort by updatedAt descending so we keep the most-recently-used sessions
          sessions.sort((a, b) => b.updatedAt - a.updatedAt);
          sessions.length = MAX_SESSIONS;
        }

        set({ sessions, currentSessionId: session.id });
        return session;
      },

      deleteSession: (id) => {
        const state = get();
        const sessions = state.sessions.filter((s) => s.id !== id);
        // Fall back to the next available session or null
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
                // Auto-title once we have a first user message
                title: s.title === 'New chat' ? autoTitle(messages) : s.title,
              }
            : s
        );
        set({ sessions });
      },

      updateModel: (id, model) => {
        const sessions = get().sessions.map((s) =>
          s.id === id ? { ...s, model, updatedAt: Date.now() } : s
        );
        set({ sessions });
      },

      updateTitle: (id, title) => {
        const sessions = get().sessions.map((s) =>
          s.id === id ? { ...s, title, updatedAt: Date.now() } : s
        );
        set({ sessions });
      },

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find((s) => s.id === currentSessionId) ?? null;
      },
    }),
    {
      name: 'chat-sessions',
      // Only persist sessions list and active ID — skip computed/transient state
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);
