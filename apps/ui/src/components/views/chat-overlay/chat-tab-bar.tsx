/**
 * ChatTabBar — Horizontal tab bar for active chat sessions.
 *
 * Renders one tab per active session (from activeSessions), shows a streaming
 * indicator dot when the session is streaming, a close button on each tab,
 * and a [+] button to create a new session.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useChatStore } from '@/store/chat-store';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { cn } from '@/lib/utils';

interface ChatTabBarProps {
  /** Filter tabs to sessions belonging to this project. */
  projectId?: string;
  /** Model alias to use when creating a new session. */
  modelAlias?: string;
  className?: string;
}

/** Format elapsed seconds as m:ss */
function formatElapsed(startMs: number): string {
  const secs = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ChatTabBar({ projectId, modelAlias, className }: ChatTabBarProps) {
  const activeSessions = useChatStore((s) => s.activeSessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const sessionStreamingMap = useChatStore((s) => s.sessionStreamingMap);
  const switchSession = useChatStore((s) => s.switchSession);
  const createSession = useChatStore((s) => s.createSession);
  const activateSession = useChatStore((s) => s.activateSession);
  const deactivateSession = useChatStore((s) => s.deactivateSession);

  // Track when each session started streaming (wall-clock ms)
  const streamingStartTimesRef = useRef<Record<string, number>>({});
  // Tick state drives re-renders every second while any session is streaming
  const [, setTick] = useState(0);

  // Close confirmation dialog state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const pendingCloseSession = pendingCloseId ? sessions.find((s) => s.id === pendingCloseId) : null;

  // Maintain streaming start times: record on first true, clear on false
  useEffect(() => {
    const map = sessionStreamingMap;
    for (const [id, streaming] of Object.entries(map)) {
      if (streaming && streamingStartTimesRef.current[id] === undefined) {
        streamingStartTimesRef.current[id] = Date.now();
      } else if (!streaming) {
        delete streamingStartTimesRef.current[id];
      }
    }
    // Clear stale entries for sessions no longer in the map
    for (const id of Object.keys(streamingStartTimesRef.current)) {
      if (!map[id]) {
        delete streamingStartTimesRef.current[id];
      }
    }
  }, [sessionStreamingMap]);

  // Tick every second while any session is streaming so elapsed times update
  useEffect(() => {
    const anyStreaming = Object.values(sessionStreamingMap).some(Boolean);
    if (!anyStreaming) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [sessionStreamingMap]);

  // Only show tabs for active sessions; optionally filtered by project
  const visibleIds = activeSessions.filter((id) => {
    if (!projectId) return true;
    const session = sessions.find((s) => s.id === id);
    return session?.projectId === projectId;
  });

  const handleNew = () => {
    const session = createSession(modelAlias ?? 'sonnet', projectId);
    activateSession(session.id);
  };

  const handleCloseRequest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Prevent closing the last tab — always keep at least one
    if (visibleIds.length <= 1) return;
    setPendingCloseId(id);
    setCloseDialogOpen(true);
  };

  const handleCloseConfirm = useCallback(() => {
    if (!pendingCloseId) return;
    deactivateSession(pendingCloseId);
    // If closing the current tab, switch to the nearest remaining
    if (pendingCloseId === currentSessionId) {
      const remaining = visibleIds.filter((sid) => sid !== pendingCloseId);
      if (remaining.length > 0) {
        switchSession(remaining[0]);
      }
    }
    setPendingCloseId(null);
  }, [pendingCloseId, currentSessionId, visibleIds, deactivateSession, switchSession]);

  return (
    <>
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
              onClick={() => {
                switchSession(sessionId);
                activateSession(sessionId);
              }}
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

              {/* Elapsed time — shown while streaming */}
              {isStreaming && streamingStartTimesRef.current[sessionId] !== undefined && (
                <span className="shrink-0 font-mono text-[10px] text-green-500">
                  {formatElapsed(streamingStartTimesRef.current[sessionId])}
                </span>
              )}

              {/* Close button — hidden on last remaining tab */}
              {visibleIds.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => handleCloseRequest(e, sessionId)}
                  className={cn(
                    'flex shrink-0 items-center rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                    isActive && 'opacity-60 hover:opacity-100'
                  )}
                  title={`Close "${title}"`}
                  data-testid={`chat-tab-close-${sessionId}`}
                >
                  <X className="size-3" />
                </span>
              )}
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

      {/* Close tab confirmation dialog */}
      <DeleteConfirmDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        onConfirm={handleCloseConfirm}
        title="Close chat tab"
        description={`Close "${pendingCloseSession?.title ?? 'this session'}"? The conversation will be removed from active tabs but stays in your history.`}
        confirmText="Close tab"
      />
    </>
  );
}
