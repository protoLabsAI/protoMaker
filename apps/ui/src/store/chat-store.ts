/**
 * Chat Store - State management for chat sessions and messages
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface ImageAttachment {
  id?: string; // Optional - may not be present in messages loaded from server
  data: string; // base64 encoded image data
  mimeType: string; // e.g., "image/png", "image/jpeg"
  filename: string;
  size?: number; // file size in bytes - optional for messages from server
}

export interface TextFileAttachment {
  id: string;
  content: string; // text content of the file
  mimeType: string; // e.g., "text/plain", "text/markdown"
  filename: string;
  size: number; // file size in bytes
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: ImageAttachment[];
  textFiles?: TextFileAttachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  projectId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}

// ============================================================================
// State Interface
// ============================================================================

interface ChatStoreState {
  chatSessions: ChatSession[];
  currentChatSession: ChatSession | null;
  chatHistoryOpen: boolean;
}

// ============================================================================
// Actions Interface
// ============================================================================

interface ChatActions {
  createChatSession: (title?: string) => ChatSession;
  updateChatSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  setCurrentChatSession: (session: ChatSession | null) => void;
  archiveChatSession: (sessionId: string) => void;
  unarchiveChatSession: (sessionId: string) => void;
  deleteChatSession: (sessionId: string) => void;
  setChatHistoryOpen: (open: boolean) => void;
  toggleChatHistory: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ChatStoreState = {
  chatSessions: [],
  currentChatSession: null,
  chatHistoryOpen: false,
};

// ============================================================================
// Store
// ============================================================================

export const useChatStore = create<ChatStoreState & ChatActions>((set, get) => ({
  ...initialState,

  createChatSession: (title) => {
    const now = new Date();
    const session: ChatSession = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title || `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      projectId: '', // Will be set by the caller if needed
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content:
            "Hello! I'm the Automaker Agent. I can help you build software autonomously. What would you like to create today?",
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      archived: false,
    };

    set({
      chatSessions: [...get().chatSessions, session],
      currentChatSession: session,
    });

    return session;
  },

  updateChatSession: (sessionId, updates) => {
    set({
      chatSessions: get().chatSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates, updatedAt: new Date() } : session
      ),
    });

    // Update current session if it's the one being updated
    const currentSession = get().currentChatSession;
    if (currentSession && currentSession.id === sessionId) {
      set({
        currentChatSession: {
          ...currentSession,
          ...updates,
          updatedAt: new Date(),
        },
      });
    }
  },

  addMessageToSession: (sessionId, message) => {
    const sessions = get().chatSessions;
    const sessionIndex = sessions.findIndex((s) => s.id === sessionId);

    if (sessionIndex >= 0) {
      const updatedSessions = [...sessions];
      updatedSessions[sessionIndex] = {
        ...updatedSessions[sessionIndex],
        messages: [...updatedSessions[sessionIndex].messages, message],
        updatedAt: new Date(),
      };

      set({ chatSessions: updatedSessions });

      // Update current session if it's the one being updated
      const currentSession = get().currentChatSession;
      if (currentSession && currentSession.id === sessionId) {
        set({
          currentChatSession: updatedSessions[sessionIndex],
        });
      }
    }
  },

  setCurrentChatSession: (session) => {
    set({ currentChatSession: session });
  },

  archiveChatSession: (sessionId) => {
    get().updateChatSession(sessionId, { archived: true });
  },

  unarchiveChatSession: (sessionId) => {
    get().updateChatSession(sessionId, { archived: false });
  },

  deleteChatSession: (sessionId) => {
    const currentSession = get().currentChatSession;
    set({
      chatSessions: get().chatSessions.filter((s) => s.id !== sessionId),
      currentChatSession: currentSession?.id === sessionId ? null : currentSession,
    });
  },

  setChatHistoryOpen: (open) => set({ chatHistoryOpen: open }),

  toggleChatHistory: () => set({ chatHistoryOpen: !get().chatHistoryOpen }),
}));
