/**
 * ChatSessionSlot — A self-contained chat session with its own useChat hook.
 *
 * Each slot manages the full lifecycle of a single chat session:
 * - Mounts with a live useChat hook (activate)
 * - Syncs messages bidirectionally with the Zustand chat store
 * - Syncs streaming state to the store's sessionStreamingMap
 * - Renders AskAvaTab with visibility controlled by CSS (not conditional rendering)
 * - Unmounts cleanly (deactivate + stream cleanup)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { toast } from 'sonner';
import { useChatStore } from '@/store/chat-store';
import { getAuthHeaders } from '@/lib/api-fetch';
import { AskAvaTab } from './ask-ava-tab';
import { cn } from '@/lib/utils';

interface ChatSessionSlotProps {
  sessionId: string;
  visible: boolean;
  projectPath?: string;
  projectId?: string;
}

export function ChatSessionSlot({
  sessionId,
  visible,
  projectPath,
  projectId,
}: ChatSessionSlotProps) {
  const {
    sessions,
    activateSession,
    deactivateSession,
    saveMessages,
    setSessionStreaming,
    historyOpen,
    setHistoryOpen,
    switchSession,
    createSession,
    deleteSession,
  } = useChatStore();

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const modelAlias = session?.modelAlias ?? 'sonnet';
  const effortLevel = session?.effortLevel ?? 'medium';

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: {
          ...getAuthHeaders(),
          'x-model-alias': modelAlias,
          'x-effort-level': effortLevel,
        },
        body: projectPath !== undefined ? { projectPath } : {},
        credentials: 'include',
      }),
    [modelAlias, effortLevel, projectPath]
  );

  const { messages, sendMessage, stop, status, setMessages, addToolApprovalResponse } = useChat({
    id: sessionId,
    transport,
    messages: session?.messages,
    onError: (err) => {
      console.error('[ChatSessionSlot] Chat error:', err);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);

  // Track whether we've already seeded messages from the store on first mount
  const seededRef = useRef(false);
  // Track previous streaming state to detect transitions
  const prevStreamingRef = useRef(false);

  // Seed messages from store on first mount
  useEffect(() => {
    if (!seededRef.current && session?.messages && session.messages.length > 0) {
      setMessages(session.messages);
      seededRef.current = true;
    }
  }, []);

  // Activate on mount, deactivate on unmount
  useEffect(() => {
    activateSession(sessionId);
    return () => {
      deactivateSession(sessionId);
    };
  }, [sessionId, activateSession, deactivateSession]);

  // Sync streaming state to the store
  useEffect(() => {
    setSessionStreaming(sessionId, isStreaming);
  }, [sessionId, isStreaming, setSessionStreaming]);

  // Toast when a background session finishes (modal was closed during streaming)
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    if (wasStreaming && !isStreaming && !chatModalOpen) {
      const title = session?.title ?? 'Chat session';
      toast(`${title} complete`, {
        description: 'Ava finished responding. Click to open.',
        action: {
          label: 'Open',
          onClick: () => useChatStore.getState().setChatModalOpen(true),
        },
      });
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, chatModalOpen, session?.title]);

  // Persist messages to the store whenever they change
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(sessionId, messages);
    }
  }, [messages, sessionId, saveMessages]);

  const handleSubmit = useCallback(
    (text: string) => {
      void sendMessage({ text });
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleNewChat = useCallback(() => {
    createSession(modelAlias, projectId);
  }, [createSession, modelAlias, projectId]);

  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
    },
    [switchSession]
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteSession(id);
    },
    [deleteSession]
  );

  const handleModelChange = useCallback(
    (alias: string) => {
      useChatStore.getState().updateModel(sessionId, alias);
    },
    [sessionId]
  );

  const handleEffortChange = useCallback(
    (effort: typeof effortLevel) => {
      useChatStore.getState().updateEffort(sessionId, effort);
    },
    [sessionId]
  );

  const handleCloseHistory = useCallback(() => {
    setHistoryOpen(false);
  }, [setHistoryOpen]);

  const approveToolAction = useCallback(
    (approvalId: string) => {
      addToolApprovalResponse({ id: approvalId, approved: true });
    },
    [addToolApprovalResponse]
  );

  const rejectToolAction = useCallback(
    (approvalId: string) => {
      addToolApprovalResponse({ id: approvalId, approved: false, reason: 'User rejected' });
    },
    [addToolApprovalResponse]
  );

  const visibleSessions = useMemo(
    () => (projectId ? sessions.filter((s) => s.projectId === projectId) : sessions),
    [sessions, projectId]
  );

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', !visible && 'hidden')}>
      <AskAvaTab
        displayedMessages={messages}
        isStreaming={isStreaming}
        suggestions={[]}
        sessions={visibleSessions}
        currentSessionId={sessionId}
        modelAlias={modelAlias}
        tokenUsage={{ total: 0, input: 0, output: 0, estimated: true }}
        branchInfoMap={new Map()}
        pendingBranchOrigId={null}
        settingsOpen={false}
        historyOpen={historyOpen}
        queueOpen={false}
        queuePaused={false}
        stepCount={0}
        effortLevel={effortLevel}
        onSubmit={handleSubmit}
        onStop={handleStop}
        onSuggestionSelect={handleSubmit}
        onRegenerate={() => {}}
        onThumbsUp={() => {}}
        onThumbsDown={() => {}}
        onToolApprove={approveToolAction}
        onToolReject={rejectToolAction}
        onPreviousBranch={() => {}}
        onNextBranch={() => {}}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onCloseHistory={handleCloseHistory}
        onToggleQueuePause={() => {}}
        onModelChange={handleModelChange}
        onEffortChange={handleEffortChange}
        getToolProgressLabel={() => undefined}
        pendingSubagentApprovals={[]}
        approveSubagentTool={() => {}}
        denySubagentTool={() => {}}
        projectPath={projectPath}
      />
    </div>
  );
}
