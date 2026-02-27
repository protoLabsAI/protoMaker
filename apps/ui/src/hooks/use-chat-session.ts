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
  /** Absolute path of the current project, sent in transport body */
  projectPath?: string;
  /** Project ID used to scope sessions */
  projectId?: string;
}

export function useChatSession({
  defaultModel = 'sonnet',
  body,
  projectPath,
  projectId,
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
    getSessionsForProject,
    historyOpen,
    toggleHistory,
    setHistoryOpen,
  } = useChatStore();

  const currentSession = getCurrentSession();
  const modelAlias = currentSession?.modelAlias ?? defaultModel;

  // Filter sessions by projectId when provided
  const visibleSessions = useMemo(
    () => (projectId ? getSessionsForProject(projectId) : sessions),
    [projectId, getSessionsForProject, sessions]
  );

  // Track session switch to avoid saving stale messages
  const activeSessionRef = useRef(currentSessionId);

  // Merge projectPath into transport body
  const transportBody = useMemo(
    () => ({ ...body, ...(projectPath !== undefined ? { projectPath } : {}) }),
    [body, projectPath]
  );

  // AI SDK v6 requires transport instead of api/headers/body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: { 'x-model-alias': modelAlias },
        body: transportBody,
      }),
    [modelAlias, transportBody]
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
    const session = createSession(modelAlias, projectId);
    setMessages([]);
    activeSessionRef.current = session.id;
  }, [createSession, modelAlias, projectId, setMessages]);

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

  // Ensure there's always a session (scoped to project when projectId provided)
  useEffect(() => {
    if (!currentSessionId || !visibleSessions.find((s) => s.id === currentSessionId)) {
      if (visibleSessions.length > 0) {
        switchSession(visibleSessions[0].id);
      } else {
        createSession(defaultModel, projectId);
      }
    }
  }, [currentSessionId, visibleSessions, switchSession, createSession, defaultModel, projectId]);

  return {
    // Chat state
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    setMessages,

    // Session management
    sessions: visibleSessions,
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
