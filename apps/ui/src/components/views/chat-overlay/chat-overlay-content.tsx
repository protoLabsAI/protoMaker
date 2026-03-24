/**
 * ChatOverlayContent — Ava chat panel content.
 *
 * Renders the header, session tab bar, and chat session pool.
 * Each session tab runs an independent useChat hook with its own SSE stream.
 *
 * Used by the web fallback modal (ChatModal).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { History, X, Settings, ChevronUp, ChevronDown, SquarePen, ListOrdered } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useAppStore } from '@/store/app-store';
import { ChatSessionPool } from './chat-session-pool';
import { ChatTabBar } from './chat-tab-bar';

export interface ChatOverlayContentProps {
  /** Called when the user wants to close/hide the overlay or modal */
  onHide: () => void;
  /** When true, renders in modal mode (no drag region, different hint text) */
  isModal?: boolean;
  /** Whether the panel is currently visible — gates keyboard shortcuts to prevent interference when hidden */
  isOpen?: boolean;
}

export function ChatOverlayContent({
  onHide,
  isModal = false,
  isOpen = true,
}: ChatOverlayContentProps) {
  const currentProject = useAppStore((s) => s.currentProject);

  // Chat store — multi-session state
  const activeSessions = useChatStore((s) => s.activeSessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const historyOpen = useChatStore((s) => s.historyOpen);
  const toggleHistory = useChatStore((s) => s.toggleHistory);
  const setHistoryOpen = useChatStore((s) => s.setHistoryOpen);
  const createSession = useChatStore((s) => s.createSession);
  const activateSession = useChatStore((s) => s.activateSession);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // Bootstrap: on mount, ensure currentSessionId is set and in activeSessions so
  // ChatSessionPool has a slot to render. activeSessions is runtime-only (not persisted).
  useEffect(() => {
    const store = useChatStore.getState();
    const { currentSessionId: sid, sessions: allSessions } = store;

    if (sid) {
      store.activateSession(sid);
    } else if (allSessions.length > 0) {
      const firstId = allSessions[0].id;
      store.switchSession(firstId);
      store.activateSession(firstId);
    } else {
      const session = store.createSession('sonnet', currentProject?.id ?? 'default');
      store.activateSession(session.id);
    }
  }, []); // Intentionally empty — bootstrap runs once on mount

  // Recovery: if all sessions are gone (user closed all tabs), auto-create one.
  // Skip the first run — bootstrap effect handles initialization.
  const bootstrapDoneRef = useRef(false);
  useEffect(() => {
    if (!bootstrapDoneRef.current) {
      bootstrapDoneRef.current = true;
      return;
    }
    if (activeSessions.length === 0) {
      const store = useChatStore.getState();
      const session = store.createSession('sonnet', currentProject?.id ?? 'default');
      store.activateSession(session.id);
      return;
    }
    if (currentSessionId === null || currentSessionId === undefined) {
      useChatStore.getState().switchSession(activeSessions[0]);
    }
  }, [activeSessions, currentSessionId, currentProject]);

  const handleNewChat = useCallback(() => {
    const session = createSession('sonnet', currentProject?.id ?? 'default');
    activateSession(session.id);
  }, [createSession, activateSession, currentProject]);

  const handleExpand = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  // Escape key: close history panel if open, otherwise hide the overlay.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (historyOpen) {
          setHistoryOpen(false);
        } else {
          onHide();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, historyOpen, setHistoryOpen, onHide]);

  return (
    <div data-slot="chat-overlay-content" className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-3 py-2',
          !isModal && 'titlebar-drag-region'
        )}
      >
        <div className={cn('flex items-center gap-2 min-w-0', !isModal && 'pointer-events-none')}>
          <div className="size-2 shrink-0 rounded-full bg-primary animate-pulse" />
          <span className="shrink-0 text-sm font-medium text-foreground">Ava</span>
        </div>
        <div className={cn('flex items-center gap-1', !isModal && 'pointer-events-auto')}>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={toggleHistory}
            title="Conversation history"
            aria-label="Toggle conversation history"
          >
            <History className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setQueueOpen((v) => !v)}
            title="Feature queue"
            aria-label="Toggle feature queue"
            data-testid="queue-panel-toggle"
          >
            <ListOrdered className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
          >
            <SquarePen className="size-3.5" />
          </Button>
          {!isModal && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleExpand}
              title={expanded ? 'Collapse' : 'Expand'}
              aria-label={expanded ? 'Collapse overlay' : 'Expand overlay'}
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
            aria-label="Toggle settings"
          >
            <Settings className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onHide}
            title={isModal ? 'Close' : 'Hide (Esc)'}
            aria-label={isModal ? 'Close chat' : 'Hide overlay'}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Session tab bar — always visible */}
      <ChatTabBar projectId={currentProject?.id} />

      {/* Session pool — renders one ChatSessionSlot per active session */}
      <ChatSessionPool projectPath={currentProject?.path} projectId={currentProject?.id} />
    </div>
  );
}
