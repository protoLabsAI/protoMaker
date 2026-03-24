/**
 * ChatTabBar — Horizontal tab bar for active chat sessions.
 *
 * Renders one tab per active session (from activeSessions), shows a streaming
 * indicator dot when the session is streaming, a close button on each tab,
 * and a [+] button to create a new session.
 */

import { Plus, X } from 'lucide-react';
import { useChatStore } from '@/store/chat-store';
import { cn } from '@/lib/utils';

interface ChatTabBarProps {
  /** Filter tabs to sessions belonging to this project. */
  projectId?: string;
  /** Model alias to use when creating a new session. */
  modelAlias?: string;
  className?: string;
}

export function ChatTabBar({ projectId, modelAlias, className }: ChatTabBarProps) {
  const activeSessions = useChatStore((s) => s.activeSessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const sessionStreamingMap = useChatStore((s) => s.sessionStreamingMap);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const createSession = useChatStore((s) => s.createSession);

  // Only show tabs for active sessions; optionally filtered by project
  const visibleIds = activeSessions.filter((id) => {
    if (!projectId) return true;
    const session = sessions.find((s) => s.id === id);
    return session?.projectId === projectId;
  });

  const handleNew = () => {
    createSession(modelAlias ?? 'sonnet', projectId);
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    // Prevent the click from also triggering the tab switch
    e.stopPropagation();
    deleteSession(id);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-1 py-0.5',
        className
      )}
      data-testid="chat-tab-bar"
    >
      {visibleIds.map((sessionId) => {
        const session = sessions.find((s) => s.id === sessionId);
        const title = session?.title ?? 'New chat';
        const isActive = sessionId === currentSessionId;
        const isStreaming = sessionStreamingMap[sessionId] === true;

        return (
          <button
            key={sessionId}
            onClick={() => switchSession(sessionId)}
            className={cn(
              'group flex min-w-0 max-w-[160px] shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            title={title}
            data-testid={`chat-tab-${sessionId}`}
          >
            {/* Streaming indicator dot */}
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                isStreaming
                  ? 'animate-pulse bg-green-500'
                  : isActive
                    ? 'bg-foreground/40'
                    : 'bg-muted-foreground/30'
              )}
            />

            {/* Session title — truncated */}
            <span className="min-w-0 flex-1 truncate text-left">{title}</span>

            {/* Close button */}
            <span
              role="button"
              onClick={(e) => handleClose(e, sessionId)}
              className={cn(
                'flex shrink-0 items-center rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                isActive && 'opacity-60 hover:opacity-100'
              )}
              title={`Close "${title}"`}
              data-testid={`chat-tab-close-${sessionId}`}
            >
              <X className="size-3" />
            </span>
          </button>
        );
      })}

      {/* New session button */}
      <button
        onClick={handleNew}
        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        title="New chat session"
        data-testid="chat-tab-new"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
