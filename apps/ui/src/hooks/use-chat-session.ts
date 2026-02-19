/**
 * useChatSession — Coordinates AI SDK useChat with persistent chat store.
 *
 * Manages the lifecycle of chat sessions: creating, switching, persisting messages,
 * and syncing between useChat's live state and the Zustand store.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useChatStore } from '@/store/chat-store';

interface UseChatSessionOptions {
  /** Default model for new sessions */
  defaultModel?: string;
  /** Extra body data sent with every chat request (e.g. notes context) */
  body?: Record<string, unknown>;
}

export function useChatSession({ defaultModel = 'sonnet', body }: UseChatSessionOptions = {}) {
  const {
    sessions,
    currentSessionId,
    createSession,
    deleteSession,
    switchSession,
    saveMessages,
    updateModel,
    getCurrentSession,
    historyOpen,
    toggleHistory,
    setHistoryOpen,
  } = useChatStore();

  const currentSession = getCurrentSession();
  const modelAlias = currentSession?.modelAlias ?? defaultModel;

  // Track session switch to avoid saving stale messages
  const activeSessionRef = useRef(currentSessionId);

  // AI SDK v6 requires transport instead of api/headers/body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: { 'x-model-alias': modelAlias },
        body,
      }),
    [modelAlias, body]
  );

  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    id: currentSessionId ?? undefined,
    transport,
    messages: currentSession?.messages,
    onError: (err) => {
      console.error('Chat error:', err);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // When messages change, persist to store
  useEffect(() => {
    if (currentSessionId && activeSessionRef.current === currentSessionId && messages.length > 0) {
      saveMessages(currentSessionId, messages);
    }
  }, [messages, currentSessionId, saveMessages]);

  // When switching sessions, load the new session's messages
  useEffect(() => {
    if (currentSessionId !== activeSessionRef.current) {
      activeSessionRef.current = currentSessionId;
      const session = getCurrentSession();
      setMessages(session?.messages ?? []);
    }
  }, [currentSessionId, getCurrentSession, setMessages]);

  const handleNewChat = useCallback(() => {
    const session = createSession(modelAlias);
    setMessages([]);
    activeSessionRef.current = session.id;
  }, [createSession, modelAlias, setMessages]);

  const handleSwitchSession = useCallback(
    (id: string) => {
      // Save current messages before switching
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

  // Ensure there's always a session
  useEffect(() => {
    if (!currentSessionId || !sessions.find((s) => s.id === currentSessionId)) {
      if (sessions.length > 0) {
        switchSession(sessions[0].id);
      } else {
        createSession(defaultModel);
      }
    }
  }, [currentSessionId, sessions, switchSession, createSession, defaultModel]);

  return {
    // Chat state
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    setMessages,

    // Session management
    sessions,
    currentSessionId,
    currentSession,
    modelAlias,
    handleNewChat,
    handleSwitchSession,
    handleDeleteSession,
    handleModelChange,

    // History panel
    historyOpen,
    toggleHistory,
    setHistoryOpen,
  };
}
