/**
 * ChatOverlayView — Ava Anywhere global chat overlay.
 *
 * Renders a full-window chat interface for the Electron overlay panel.
 * Uses shared @protolabs/ui/ai components. The overlay is shown/hidden
 * via global shortcut (Cmd/Ctrl+Shift+Space) managed by Electron main process.
 *
 * M2: Adds conversation management (list, switch, delete), model selection,
 * and persistent chat history via useChatSession.
 */

import { useState, useCallback, useEffect } from 'react';
import { History, X } from 'lucide-react';
import { ChatMessageList, ChatInput } from '@protolabs/ui/ai';
import { Button } from '@protolabs/ui/atoms';
import { cn } from '@/lib/utils';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { useChatSession } from '@/hooks/use-chat-session';
import { ChatModelSelect } from '@/components/views/chat/components/chat-model-select';
import { ConversationList } from './conversation-list';

export function ChatOverlayView() {
  const [inputValue, setInputValue] = useState('');

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
  } = useChatSession({ defaultModel: 'sonnet' });

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInputValue('');
  }, [inputValue, isStreaming, sendMessage]);

  const handleHide = useCallback(() => {
    if (isElectron()) {
      getElectronAPI()?.hideOverlay?.();
    }
  }, []);

  // Escape key hides the overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (historyOpen) {
          setHistoryOpen(false);
        } else {
          handleHide();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHide, historyOpen, setHistoryOpen]);

  return (
    <div
      data-slot="chat-overlay"
      className={cn(
        'flex h-screen w-screen flex-col bg-background',
        'overflow-hidden rounded-xl border border-border'
      )}
    >
      {/* Drag handle + header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 titlebar-drag-region">
        <div className="flex items-center gap-2 pointer-events-none">
          <div className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">Ava</span>
        </div>
        <div className="flex items-center gap-1 pointer-events-auto">
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
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleHide}
            title="Hide (Esc)"
            aria-label="Hide overlay"
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
        {/* Conversation list panel */}
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
                  {isStreaming ? 'Streaming...' : 'Enter to send \u00B7 Esc to hide'}
                </span>
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
