/**
 * ChatOverlayContent — Shared chat content for overlay and modal.
 *
 * Contains the header, message list, input, and conversation history.
 * Used by both the Electron overlay view and the web fallback modal.
 *
 * Reads currentProject from useAppStore and passes projectId/projectPath
 * to useChatSession for project-scoped session management.
 *
 * Input state is managed via PromptInputProvider so ChatInput does not
 * require value/onChange props to be threaded through the tree.
 */

import { useState, useCallback, useEffect } from 'react';
import { History, X, Settings, ChevronUp, ChevronDown, SquarePen, ListOrdered } from 'lucide-react';
import {
  ChatMessageList,
  ChatInput,
  SuggestionList,
  PromptInputProvider,
  QueueView,
  type QueueItem,
} from '@protolabs-ai/ui/ai';
import { Button } from '@protolabs-ai/ui/atoms';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { ChatModelSelect } from '@/components/views/chat/components/chat-model-select';
import { ConversationList } from './conversation-list';
import { AvaSettingsPanel } from './ava-settings-panel';
import { useChatSession } from '@/hooks/use-chat-session';
import { useAppStore } from '@/store/app-store';
import { useContextualSuggestions } from '@/hooks/use-contextual-suggestions';
import { getOverlayAPI } from '@/lib/electron';

const OVERLAY_HEIGHT_DEFAULT = 600;
const OVERLAY_HEIGHT_EXPANDED = 900;

export interface ChatOverlayContentProps {
  /** Called when the user wants to close/hide the overlay or modal */
  onHide: () => void;
  /** When true, renders in modal mode (no drag region, different hint text) */
  isModal?: boolean;
}

export function ChatOverlayContent({ onHide, isModal = false }: ChatOverlayContentProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const features = useAppStore((s) => s.features);

  const {
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    sessions,
    currentSessionId,
    modelAlias,
    handleNewChat,
    handleSwitchSession,
    handleDeleteSession,
    handleModelChange,
    historyOpen,
    toggleHistory,
    setHistoryOpen,
  } = useChatSession({
    defaultModel: 'sonnet',
    projectId: currentProject?.id,
    projectPath: currentProject?.path,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);

  const suggestions = useContextualSuggestions(features ?? []);

  // onSubmit receives the trimmed text from ChatInput (via PromptInputProvider).
  // ChatInput clears the input immediately after calling this.
  const handleSubmit = useCallback(
    (text: string) => {
      if (isStreaming) return;
      sendMessage({ text });
    },
    [isStreaming, sendMessage]
  );

  const handleSuggestionSelect = useCallback(
    (value: string) => {
      sendMessage({ text: value });
    },
    [sendMessage]
  );

  const handleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    getOverlayAPI()?.resizeOverlay?.(next ? OVERLAY_HEIGHT_EXPANDED : OVERLAY_HEIGHT_DEFAULT);
  }, [expanded]);

  // Regenerate: re-send the last user message text
  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      const text = (lastUserMsg.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
      if (text) sendMessage({ text });
    }
  }, [messages, sendMessage]);

  // Thumbs up/down — no-op placeholders; wire to telemetry or feedback API as needed
  const handleThumbsUp = useCallback(() => {
    // Positive feedback placeholder
  }, []);

  const handleThumbsDown = useCallback(() => {
    // Negative feedback placeholder
  }, []);

  const shortcutHint = isModal ? '\u2318K to close' : 'Esc to hide';

  // Escape key: close history panel if open, otherwise hide the overlay
  useEffect(() => {
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
  }, [historyOpen, setHistoryOpen, onHide]);

  return (
    <div data-slot="chat-overlay-content" className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-3 py-2',
          !isModal && 'titlebar-drag-region'
        )}
      >
        <div className={cn('flex items-center gap-2', !isModal && 'pointer-events-none')}>
          <div className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">Ava</span>
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
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Settings"
                aria-label="Open settings"
              >
                <Settings className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
              <AvaSettingsPanel projectPath={currentProject?.path} />
            </PopoverContent>
          </Popover>
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

      {/* Error banner */}
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message || 'An error occurred'}
        </div>
      )}

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Queue panel — slide in from left */}
        {queueOpen && (
          <div className="w-56 shrink-0 border-r border-border overflow-y-auto p-2 animate-in slide-in-from-left duration-200">
            <QueueView
              items={[]}
              paused={queuePaused}
              onTogglePause={() => setQueuePaused((v) => !v)}
            />
          </div>
        )}

        {/* Conversation list panel — slide in from left */}
        {historyOpen && (
          <ConversationList
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelect={(id) => {
              handleSwitchSession(id);
              setHistoryOpen(false);
            }}
            onNew={() => {
              handleNewChat();
              setHistoryOpen(false);
            }}
            onDelete={handleDeleteSession}
            onClose={() => setHistoryOpen(false)}
            className="animate-in slide-in-from-left duration-200"
          />
        )}

        {/* Chat area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatMessageList
            messages={messages}
            emptyMessage="Ask Ava anything..."
            isStreaming={isStreaming}
            onRegenerate={handleRegenerate}
            onThumbsUp={handleThumbsUp}
            onThumbsDown={handleThumbsDown}
          />

          {/* Contextual suggestions — shown only when no messages in current session */}
          {messages.length === 0 && (
            <SuggestionList suggestions={suggestions} onSelect={handleSuggestionSelect} />
          )}

          {/* PromptInputProvider scopes input state to this chat area */}
          <PromptInputProvider>
            <ChatInput
              onSubmit={handleSubmit}
              onStop={stop}
              isStreaming={isStreaming}
              placeholder="Ask Ava..."
              autoFocus
              actions={
                <>
                  <ChatModelSelect value={modelAlias} onValueChange={handleModelChange} />
                  <span className="text-xs text-muted-foreground">
                    {isStreaming ? 'Streaming...' : `Enter to send \u00B7 ${shortcutHint}`}
                  </span>
                </>
              }
            />
          </PromptInputProvider>
        </div>
      </div>
    </div>
  );
}
