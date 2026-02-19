/**
 * ChatOverlayView — Ava Anywhere global chat overlay.
 *
 * Renders a full-window chat interface for the Electron overlay panel.
 * Uses shared @protolabs/ui/ai components. The overlay is shown/hidden
 * via global shortcut (Cmd/Ctrl+Shift+Space) managed by Electron main process.
 */

import { useState, useCallback, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { X } from 'lucide-react';
import { ChatMessageList, ChatInput } from '@protolabs/ui/ai';
import { Button } from '@protolabs/ui/atoms';
import { cn } from '@/lib/utils';
import { getElectronAPI, isElectron } from '@/lib/electron';

export function ChatOverlayView() {
  const [inputValue, setInputValue] = useState('');

  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    api: '/api/chat',
    headers: {
      'x-model-alias': 'sonnet',
    },
    onError: (err) => {
      console.error('Chat overlay error:', err);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

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

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputValue('');
  }, [setMessages]);

  // Escape key hides the overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleHide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHide]);

  return (
    <div
      data-slot="chat-overlay"
      className={cn(
        'flex h-screen w-screen flex-col bg-background',
        // Rounded corners for the overlay panel window
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
            onClick={handleNewChat}
            title="New chat"
          >
            <span className="text-xs">New</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleHide}
            title="Hide (Esc)"
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

      {/* Messages */}
      <ChatMessageList messages={messages} emptyMessage="Ask Ava anything..." />

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        onStop={stop}
        isStreaming={isStreaming}
        placeholder="Ask Ava..."
        actions={
          <span className="text-[10px] text-muted-foreground">
            {isStreaming ? 'Streaming...' : 'Enter to send \u00B7 Esc to hide'}
          </span>
        }
      />
    </div>
  );
}
