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

export type ChatEffortLevel = 'low' | 'medium' | 'high';

export interface ChatSession {
  id: string;
  title: string;
  modelAlias: string;
  effortLevel: ChatEffortLevel;
  projectId: string;
  messages: UIMessage[];
  createdAt: number; // epoch ms (serializable)
  updatedAt: number;
}

// ============================================================================
// State + Actions
// ============================================================================

const MAX_ACTIVE_SESSIONS = 5;

interface ChatStoreState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  historyOpen: boolean;
  chatModalOpen: boolean;
  /** Session ID that is currently streaming — used for the background streaming indicator */
  activeStreamingSessionId: string | null;
  /** Runtime-only: IDs of sessions with live useChat hooks (not persisted). */
  activeSessions: string[];
  /** Runtime-only: per-session streaming state map (not persisted). */
  sessionStreamingMap: Record<string, boolean>;
}

interface ChatActions {
  createSession: (modelAlias?: string, projectId?: string) => ChatSession;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  saveMessages: (id: string, messages: UIMessage[]) => void;
  updateTitle: (id: string, title: string) => void;
  updateModel: (id: string, modelAlias: string) => void;
  updateEffort: (id: string, effortLevel: ChatEffortLevel) => void;
  setHistoryOpen: (open: boolean) => void;
  toggleHistory: () => void;
  setChatModalOpen: (open: boolean) => void;
  setActiveStreamingSession: (sessionId: string | null) => void;
  getCurrentSession: () => ChatSession | null;
  getSessionsForProject: (projectId: string) => ChatSession[];
  /** Register a session as having a live useChat hook. Enforces MAX_ACTIVE_SESSIONS. */
  activateSession: (id: string) => void;
  /** Unregister a session's live useChat hook. */
  deactivateSession: (id: string) => void;
  /** Update streaming state for a specific session. */
  setSessionStreaming: (id: string, streaming: boolean) => void;
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

export { MAX_ACTIVE_SESSIONS };

export const useChatStore = create<ChatStoreState & ChatActions>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      historyOpen: false,
      chatModalOpen: false,
      activeStreamingSessionId: null,
      activeSessions: [],
      sessionStreamingMap: {},

      createSession: (modelAlias = 'sonnet', projectId = 'default') => {
        const now = Date.now();
        const session: ChatSession = {
          id: generateId(),
          title: 'New chat',
          modelAlias,
          effortLevel: 'medium',
          projectId,
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

      updateEffort: (id, effortLevel) => {
        const sessions = get().sessions.map((s) =>
          s.id === id ? { ...s, effortLevel, updatedAt: Date.now() } : s
        );
        set({ sessions });
      },

      setHistoryOpen: (open) => set({ historyOpen: open }),
      toggleHistory: () => set({ historyOpen: !get().historyOpen }),
      setChatModalOpen: (open) => set({ chatModalOpen: open }),
      setActiveStreamingSession: (sessionId) => set({ activeStreamingSessionId: sessionId }),

      getCurrentSession: () => {
        const state = get();
        return state.sessions.find((s) => s.id === state.currentSessionId) ?? null;
      },

      getSessionsForProject: (projectId) => {
        return get().sessions.filter((s) => s.projectId === projectId);
      },

      activateSession: (id) => {
        const { activeSessions } = get();
        if (activeSessions.includes(id)) return;
        const next = [...activeSessions, id];
        // Enforce cap: drop the oldest (first) entry if over limit
        if (next.length > MAX_ACTIVE_SESSIONS) {
          next.shift();
        }
        set({ activeSessions: next });
      },

      deactivateSession: (id) => {
        set((state) => ({
          activeSessions: state.activeSessions.filter((sid) => sid !== id),
          sessionStreamingMap: Object.fromEntries(
            Object.entries(state.sessionStreamingMap).filter(([k]) => k !== id)
          ),
        }));
      },

      setSessionStreaming: (id, streaming) => {
        set((state) => ({
          sessionStreamingMap: { ...state.sessionStreamingMap, [id]: streaming },
        }));
      },
    }),
    {
      name: 'ava-chat-sessions',
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as ChatStoreState;
        if (version < 2) {
          // Set projectId: 'default' on all existing sessions missing it
          state.sessions = state.sessions.map((s) => ({
            ...s,
            projectId: s.projectId ?? 'default',
          }));
        }
        return state;
      },
      // Only persist sessions and currentSessionId, not UI state
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);
