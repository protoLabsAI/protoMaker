/**
 * ChatSessionPool — Manages the lifecycle of chat session slots.
 *
 * Reads activeSessions and currentSessionId from the chat store and renders
 * one ChatSessionSlot per active session. Only the currentSessionId slot is
 * visible; the others are kept mounted but hidden so their useChat hooks
 * remain alive for background streaming.
 */

import { useChatStore } from '@/store/chat-store';
import { ChatSessionSlot } from './chat-session-slot';

interface ChatSessionPoolProps {
  projectPath?: string;
  projectId?: string;
}

export function ChatSessionPool({ projectPath, projectId }: ChatSessionPoolProps) {
  const activeSessions = useChatStore((s) => s.activeSessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeSessions.map((sessionId) => (
        <ChatSessionSlot
          key={sessionId}
          sessionId={sessionId}
          visible={sessionId === currentSessionId}
          projectPath={projectPath}
          projectId={projectId}
        />
      ))}
    </div>
  );
}
