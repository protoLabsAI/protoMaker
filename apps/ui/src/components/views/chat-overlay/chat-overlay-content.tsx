/**
 * ChatOverlayContent — Shared chat content for overlay and modal.
 *
 * Contains the header, tab bar, and tab content areas.
 * Tab 1: Ask Ava — human<>Ava chat (unchanged behavior)
 * Tab 2: Ava Channel — private Ava-to-Ava coordination message stream
 *
 * Used by both the Electron overlay view and the web fallback modal.
 *
 * Reads currentProject from useAppStore and passes projectId/projectPath
 * to ChatSessionPool for project-scoped session management.
 *
 * Multi-session support: ChatSessionPool manages active session slots;
 * ChatTabBar appears when more than one session is active.
 *
 * Input state is managed via PromptInputProvider so ChatInput does not
 * require value/onChange props to be threaded through the tree.
 */

import { useState, useCallback, useEffect } from 'react';
import { History, X, Settings, ChevronUp, ChevronDown, SquarePen, ListOrdered } from 'lucide-react';
import { Button } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useAppStore } from '@/store/app-store';
import { AvaChannelTab } from './ava-channel-tab';
import { ProjectsTab } from './projects-tab';
import { ChatSessionPool } from './chat-session-pool';
import { ChatTabBar } from './chat-tab-bar';
import {
  useAvaChannelStore,
  type AvaChannelTab as AvaChannelTabType,
} from '@/store/ava-channel-store';

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
  const [queuePaused, setQueuePaused] = useState(false);

  // Tab state — persisted in ava-channel-store so keyboard shortcut restores last active tab
  const lastActiveTab = useAvaChannelStore((s) => s.lastActiveTab);
  const setLastActiveTab = useAvaChannelStore((s) => s.setLastActiveTab);
  const [activeTab, setActiveTab] = useState<AvaChannelTabType>(lastActiveTab);

  // Sync local tab state when the store is updated externally (e.g. PM button sets 'projects')
  useEffect(() => {
    setActiveTab(lastActiveTab);
  }, [lastActiveTab]);

  const handleTabChange = useCallback(
    (tab: AvaChannelTabType) => {
      setActiveTab(tab);
      setLastActiveTab(tab);
    },
    [setLastActiveTab]
  );

  // Bootstrap: on mount, ensure currentSessionId is set and in activeSessions so
  // ChatSessionPool has a slot to render. activeSessions is runtime-only (not persisted).
  useEffect(() => {
    const store = useChatStore.getState();
    const { currentSessionId: sid, sessions: allSessions } = store;

    if (sid) {
      // Existing current session: add to activeSessions so ChatSessionPool renders it
      store.activateSession(sid);
    } else if (allSessions.length > 0) {
      // No current session but have history: switch to most recent
      const firstId = allSessions[0].id;
      store.switchSession(firstId);
      store.activateSession(firstId);
    } else {
      // Fresh start: create a new session
      const session = store.createSession('sonnet', currentProject?.id ?? 'default');
      store.activateSession(session.id);
    }
  }, []); // Intentionally empty — bootstrap runs once on mount

  // Auto-activate: if activeSessions gains members but currentSessionId is not set,
  // make the first active session current. Handles edge cases after session deletions.
  useEffect(() => {
    if (currentSessionId !== null && currentSessionId !== undefined) return;
    if (activeSessions.length === 0) return; // Wait for sessions to appear
    useChatStore.getState().switchSession(activeSessions[0]);
  }, [activeSessions, currentSessionId]);

  const handleNewChat = useCallback(() => {
    const session = createSession('sonnet', currentProject?.id ?? 'default');
    activateSession(session.id);
  }, [createSession, activateSession, currentProject]);

  const handleExpand = useCallback(() => {
    setExpanded((v) => !v);
    // Overlay resize was Electron-only — no-op in web mode
  }, []);

  // Escape key: close history panel if open, otherwise hide the overlay.
  // Only active when the panel is visible to prevent interference with other
  // keyboard handlers when the chat is running in the background.
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
          {activeTab === 'ask-ava' && (
            <>
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
            </>
          )}
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

      {/* Tab bar */}
      <div className="flex items-center border-b border-border px-2" role="tablist">
        <button
          type="button"
          role="tab"
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'ask-ava'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => handleTabChange('ask-ava')}
          aria-selected={activeTab === 'ask-ava'}
        >
          Ask Ava
        </button>
        <button
          type="button"
          role="tab"
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'projects'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => handleTabChange('projects')}
          aria-selected={activeTab === 'projects'}
        >
          Projects
        </button>
        <button
          type="button"
          role="tab"
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'ava-channel'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => handleTabChange('ava-channel')}
          aria-selected={activeTab === 'ava-channel'}
        >
          #backchannel
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'projects' ? (
        <ProjectsTab />
      ) : activeTab === 'ask-ava' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Multi-session tab bar — only shown when more than one session is active */}
          {activeSessions.length > 1 && <ChatTabBar projectId={currentProject?.id} />}
          {/* Session pool — renders one ChatSessionSlot per active session */}
          <ChatSessionPool projectPath={currentProject?.path} projectId={currentProject?.id} />
        </div>
      ) : (
        <AvaChannelTab />
      )}
    </div>
  );
}
