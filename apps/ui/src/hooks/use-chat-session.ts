/**
 * useChatSession — Coordinates AI SDK useChat with persistent chat store.
 *
 * Manages the lifecycle of chat sessions: creating, switching, persisting messages,
 * and syncing between useChat's live state and the Zustand store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useChatStore, type ChatEffortLevel } from '@/store/chat-store';
import { getHttpApiClient, getServerUrlSync } from '@/lib/http-api-client';
import { getAuthHeaders } from '@/lib/api-fetch';

/** A single queued message in the Ava Engine message queue */
export interface EngineQueueMessage {
  id: string;
  content: string;
  /** Triage classification from SSE annotations */
  triage?: 'ACT_NOW' | 'ABSORB' | 'HOLD' | 'PENDING';
  queuedAt?: string;
}

/** Queue state streamed from Ava Engine SSE annotation events */
export interface EngineQueueState {
  messages: EngineQueueMessage[];
}

/** A pending subagent tool approval surfaced from the subagent:tool-approval-request event */
export interface PendingSubagentApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  /** ISO timestamp when the approval was received (for 5-minute timeout UI) */
  receivedAt: string;
}

interface UseChatSessionOptions {
  /** Default model for new sessions */
  defaultModel?: string;
  /** Extra body data sent with every chat request (e.g. notes context) */
  body?: Record<string, unknown>;
  /** Absolute path of the current project, sent in transport body */
  projectPath?: string;
  /** Project ID used to scope sessions */
  projectId?: string;
  /**
   * Optional URL for the protoClawX Ava Engine (e.g. http://localhost:8318/api/chat).
   * When set, chat sessions use this URL as the transport target instead of /api/chat.
   * Both endpoints speak AI SDK Data Stream Protocol so all UI features work unchanged.
   */
  avaEngineUrl?: string;
}

export function useChatSession({
  defaultModel = 'sonnet',
  body,
  projectPath,
  projectId,
  avaEngineUrl,
}: UseChatSessionOptions = {}) {
  const {
    sessions,
    currentSessionId,
    createSession,
    deleteSession,
    switchSession,
    saveMessages,
    updateModel,
    updateEffort,
    getCurrentSession,
    getSessionsForProject,
    historyOpen,
    toggleHistory,
    setHistoryOpen,
  } = useChatStore();

  const currentSession = getCurrentSession();
  const modelAlias = currentSession?.modelAlias ?? defaultModel;
  const effortLevel: ChatEffortLevel = currentSession?.effortLevel ?? 'medium';

  // Filter sessions by projectId when provided
  const visibleSessions = useMemo(
    () => (projectId ? getSessionsForProject(projectId) : sessions),
    [projectId, getSessionsForProject, sessions]
  );

  // Track session switch to avoid saving stale messages
  const activeSessionRef = useRef(currentSessionId);

  // Merge projectPath into transport body
  const transportBody = useMemo(
    () => ({
      ...body,
      ...(projectPath !== undefined ? { projectPath } : {}),
    }),
    [body, projectPath]
  );

  // AI SDK v6 requires transport instead of api/headers/body.
  // When avaEngineUrl is provided, route to the protoClawX Ava Engine instead.
  // X-Session-Id ensures session continuity on the engine side.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: avaEngineUrl ?? '/api/chat',
        headers: {
          ...getAuthHeaders(),
          'x-model-alias': modelAlias,
          'x-effort-level': effortLevel,
          ...(avaEngineUrl && currentSessionId ? { 'X-Session-Id': currentSessionId } : {}),
        },
        body: transportBody,
        credentials: 'include',
      }),
    [modelAlias, effortLevel, transportBody, avaEngineUrl, currentSessionId]
  );

  const { messages, sendMessage, stop, status, setMessages, error, addToolApprovalResponse } =
    useChat({
      id: currentSessionId ?? undefined,
      transport,
      messages: currentSession?.messages,
      onError: (err) => {
        console.error('Chat error:', err);
      },
    });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // ── Engine queue state ─────────────────────────────────────────────────────
  // Tracks pending messages in the Ava Engine message queue.
  // Updated when the engine returns 202 (agent busy, message queued) or via
  // SSE annotation events of type "queue:update".
  const [engineQueueState, setEngineQueueState] = useState<EngineQueueState | null>(null);

  // Reset queue state when engine transport is disabled
  useEffect(() => {
    if (!avaEngineUrl) {
      setEngineQueueState(null);
    }
  }, [avaEngineUrl]);

  // ── Subagent approval state (gated trust model) ────────────────────────────

  const [pendingSubagentApprovals, setPendingSubagentApprovals] = useState<
    PendingSubagentApproval[]
  >([]);

  // Subscribe to subagent:tool-approval-request events from the server
  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: string, payload: unknown) => {
      if (type === 'subagent:tool-approval-request') {
        const req = payload as {
          approvalId: string;
          toolCallId: string;
          toolName: string;
          toolInput: Record<string, unknown>;
        };
        setPendingSubagentApprovals((prev) => [
          ...prev,
          {
            approvalId: req.approvalId,
            toolCallId: req.toolCallId,
            toolName: req.toolName,
            toolInput: req.toolInput,
            receivedAt: new Date().toISOString(),
          },
        ]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to pr:watch-resolved events and inject as a user message so Ava can respond
  useEffect(() => {
    const api = getHttpApiClient();
    const unsubscribe = api.subscribeToEvents((type: string, payload: unknown) => {
      if (type === 'pr:watch-resolved') {
        const event = payload as {
          prNumber: number;
          status: 'passed' | 'failed';
          checks: Array<{ name: string; conclusion: string }>;
          timestamp: string;
        };
        const failedChecks = event.checks.filter((c) => c.conclusion === 'failure');
        const messageText =
          event.status === 'passed'
            ? `[Background notification] PR #${event.prNumber}: all CI checks passed.`
            : `[Background notification] PR #${event.prNumber}: CI failed. Failed checks: ${failedChecks.map((c) => c.name).join(', ')}.`;
        void sendMessage({ text: messageText });
      }
    });
    return () => unsubscribe();
  }, [sendMessage]);

  /** Remove a pending approval from the list (after approve or deny). */
  const removePendingApproval = useCallback((approvalId: string) => {
    setPendingSubagentApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
  }, []);

  /** Approve a subagent tool call — posts to /api/chat/tool-approval. */
  const approveSubagentTool = useCallback(
    async (approvalId: string) => {
      removePendingApproval(approvalId);
      try {
        await fetch(`${getServerUrlSync()}/api/chat/tool-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ approvalId, approved: true }),
        });
      } catch (err) {
        console.error('Failed to approve subagent tool:', err);
      }
    },
    [removePendingApproval]
  );

  /** Deny a subagent tool call — posts to /api/chat/tool-approval. */
  const denySubagentTool = useCallback(
    async (approvalId: string, message?: string) => {
      removePendingApproval(approvalId);
      try {
        await fetch(`${getServerUrlSync()}/api/chat/tool-approval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            approvalId,
            approved: false,
            message: message ?? 'Denied by user',
          }),
        });
      } catch (err) {
        console.error('Failed to deny subagent tool:', err);
      }
    },
    [removePendingApproval]
  );

  // Sync streaming state to store for the background streaming indicator.
  // External consumers (e.g., the minimized chat badge) read this to know
  // whether Ava is actively working even when the panel is hidden.
  useEffect(() => {
    useChatStore
      .getState()
      .setActiveStreamingSession(isStreaming && currentSessionId ? currentSessionId : null);
  }, [isStreaming, currentSessionId]);

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

  const handleEffortChange = useCallback(
    (effort: ChatEffortLevel) => {
      if (currentSessionId) {
        updateEffort(currentSessionId, effort);
      }
    },
    [currentSessionId, updateEffort]
  );

  // HITL: approve a destructive tool call via native AI SDK approval flow.
  // The SDK pauses tool execution and the client renders a confirmation card.
  // Calling addToolApprovalResponse resumes execution in the same bubble.
  const approveToolAction = useCallback(
    (approvalId: string) => {
      addToolApprovalResponse({ id: approvalId, approved: true });
    },
    [addToolApprovalResponse]
  );

  // HITL: reject a destructive tool call via native AI SDK approval flow.
  const rejectToolAction = useCallback(
    (approvalId: string) => {
      addToolApprovalResponse({ id: approvalId, approved: false, reason: 'User rejected' });
    },
    [addToolApprovalResponse]
  );

  // ── Rewind action ──────────────────────────────────────────────────────────

  /**
   * Rewind the session to a checkpoint.
   *
   * Posts to POST /api/chat/rewind with an optional checkpointId (defaults to
   * most recent). Returns the list of restored files on success, or throws with
   * a human-readable message when no checkpoints exist.
   *
   * Also handles the /rewind built-in slash command:
   *   /rewind            → rewind to most recent checkpoint
   *   /rewind <id>       → rewind to the specified checkpoint
   */
  const rewindToCheckpoint = useCallback(
    async (checkpointId?: string): Promise<{ restoredFiles: string[]; checkpointId: string }> => {
      const response = await fetch(`${getServerUrlSync()}/api/chat/rewind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          ...(checkpointId !== undefined && { checkpointId }),
          ...(currentSessionId !== undefined && { sessionId: currentSessionId }),
        }),
      });

      const data = (await response.json()) as
        | { ok: true; restoredFiles: string[]; checkpointId: string }
        | { ok: false; message: string };

      if (!data.ok) {
        throw new Error(data.message);
      }

      return { restoredFiles: data.restoredFiles, checkpointId: data.checkpointId };
    },
    [currentSessionId]
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

    // HITL (native AI SDK approval for Ava tools)
    approveToolAction,
    rejectToolAction,

    // Checkpoint rewind
    rewindToCheckpoint,

    // Subagent approval (gated trust model)
    pendingSubagentApprovals,
    approveSubagentTool,
    denySubagentTool,

    // Session management
    sessions: visibleSessions,
    currentSessionId,
    currentSession,
    modelAlias,
    effortLevel,
    handleNewChat,
    handleSwitchSession,
    handleDeleteSession,
    handleModelChange,
    handleEffortChange,

    // History panel
    historyOpen,
    toggleHistory,
    setHistoryOpen,

    // Ava Engine transport
    avaEngineUrl,
    engineQueueState,
    setEngineQueueState,
  };
}
