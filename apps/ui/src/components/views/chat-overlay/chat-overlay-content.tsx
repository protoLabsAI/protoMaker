/**
 * ChatOverlayContent — Shared chat content for overlay and modal.
 *
 * Contains the header, message list, input, and conversation history.
 * Used by both the Electron overlay view and the web fallback modal.
 *
 * Reads currentProject from useAppStore and passes projectId/projectPath
 * to useChatSession for project-scoped session management.
 */

import { useState, useCallback } from 'react';
import { History, X, Settings } from 'lucide-react';
import { ChatMessageList, ChatInput } from '@protolabs-ai/ui/ai';
import { Button } from '@protolabs-ai/ui/atoms';
import { Popover, PopoverContent, PopoverTrigger } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { ChatModelSelect } from '@/components/views/chat/components/chat-model-select';
import { ConversationList } from './conversation-list';
import { AvaSettingsPanel } from './ava-settings-panel';
import { useChatSession } from '@/hooks/use-chat-session';
import { useAppStore } from '@/store/app-store';

export interface ChatOverlayContentProps {
  /** Called when the user wants to close/hide the overlay or modal */
  onHide: () => void;
  /** When true, renders in modal mode (no drag region, different hint text) */
  isModal?: boolean;
}

export function ChatOverlayContent({ onHide, isModal = false }: ChatOverlayContentProps) {
  const currentProject = useAppStore((s) => s.currentProject);

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

  const [inputValue, setInputValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInputValue('');
  }, [inputValue, isStreaming, sendMessage]);

  const shortcutHint = isModal ? '\u2318K to close' : 'Esc to hide';

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
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
          >
            <span className="text-xs">New</span>
          </Button>
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
          <ChatMessageList messages={messages} emptyMessage="Ask Ava anything..." />

          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onStop={stop}
            isStreaming={isStreaming}
            placeholder="Ask Ava..."
            actions={
              <>
                <ChatModelSelect value={modelAlias} onValueChange={handleModelChange} />
                <span className="text-[10px] text-muted-foreground">
                  {isStreaming ? 'Streaming...' : `Enter to send \u00B7 ${shortcutHint}`}
                </span>
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
