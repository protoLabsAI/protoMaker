/**
 * useChatSession — Coordinates AI SDK useChat with the persistent session store.
 *
 * Manages the full lifecycle of chat sessions:
 *   - Creating sessions and defaulting to the most recent one
 *   - Syncing useChat's live message stream into Zustand on every update
 *   - Switching sessions without losing in-flight message state
 *   - Flowing the selected model to the server via DefaultChatTransport
 *
 * Usage:
 *   const { messages, sendMessage, stop, isStreaming, ... } = useChatSession();
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useSessionStore } from '../store/session-store.js';

const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';
const CHAT_API_URL = '/api/chat';

interface UseChatSessionOptions {
  /** Override the default model for new sessions. */
  defaultModel?: string;
  /** Base URL of the chat API (useful in tests or custom deployments). */
  apiUrl?: string;
  /** Extra body fields sent with every chat request. */
  body?: Record<string, unknown>;
}

export function useChatSession({
  defaultModel = DEFAULT_MODEL,
  apiUrl = CHAT_API_URL,
  body,
}: UseChatSessionOptions = {}) {
  const {
    sessions,
    currentSessionId,
    createSession,
    deleteSession,
    switchSession,
    saveMessages,
    updateModel,
    getCurrentSession,
  } = useSessionStore();

  const currentSession = getCurrentSession();

  // Keep a ref so we can detect session switches without re-subscribing
  const activeSessionRef = useRef(currentSessionId);

  // Build the transport once per (model, apiUrl, body) combination.
  // DefaultChatTransport handles the HTTP POST to the server and streams back
  // AI SDK UI message stream events to the useChat hook.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl,
        body: {
          model: currentSession?.model ?? defaultModel,
          ...body,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiUrl, currentSession?.model, defaultModel, JSON.stringify(body)]
  );

  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    id: currentSessionId ?? undefined,
    transport,
    // Seed messages from the persisted session when switching sessions
    messages: currentSession?.messages,
    onError: (err) => {
      console.error('[useChatSession] Chat error:', err);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // ── Persistence ──────────────────────────────────────────────────────────

  // Sync live messages into the store after every update so progress is never lost
  useEffect(() => {
    if (currentSessionId && activeSessionRef.current === currentSessionId && messages.length > 0) {
      saveMessages(currentSessionId, messages);
    }
  }, [messages, currentSessionId, saveMessages]);

  // When the session switches, load the new session's messages into useChat
  useEffect(() => {
    if (currentSessionId !== activeSessionRef.current) {
      activeSessionRef.current = currentSessionId;
      const session = getCurrentSession();
      setMessages(session?.messages ?? []);
    }
  }, [currentSessionId, getCurrentSession, setMessages]);

  // ── Session guards ────────────────────────────────────────────────────────

  // Always ensure there's at least one session so the UI never sees null
  useEffect(() => {
    if (!currentSessionId || !sessions.find((s) => s.id === currentSessionId)) {
      if (sessions.length > 0) {
        switchSession(sessions[0].id);
      } else {
        createSession(defaultModel);
      }
    }
  }, [currentSessionId, sessions, switchSession, createSession, defaultModel]);

  // ── Public actions ────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    const session = createSession(currentSession?.model ?? defaultModel);
    setMessages([]);
    activeSessionRef.current = session.id;
  }, [createSession, currentSession?.model, defaultModel, setMessages]);

  const handleSwitchSession = useCallback(
    (id: string) => {
      // Flush current messages before switching so they're not lost
      if (currentSessionId && messages.length > 0) {
        saveMessages(currentSessionId, messages);
      }
      switchSession(id);
    },
    [currentSessionId, messages, saveMessages, switchSession]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteSession(id);
    },
    [deleteSession]
  );

  const handleModelChange = useCallback(
    (model: string) => {
      if (currentSessionId) {
        updateModel(currentSessionId, model);
      }
    },
    [currentSessionId, updateModel]
  );

  return {
    // ── Chat state ────────────────────────────────────────────────────────
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    setMessages,

    // ── Session management ────────────────────────────────────────────────
    sessions,
    currentSessionId,
    currentSession,
    handleNewChat,
    handleSwitchSession,
    handleDeleteSession,
    handleModelChange,
  };
}
