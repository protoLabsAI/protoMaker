/**
 * ChatSidebar — Collapsible right-side chat panel.
 *
 * Integrates AI SDK's useChat with the chat message list and input components.
 * Sits alongside the main content area in the root layout.
 */

import { useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { MessageSquare, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabs/ui/atoms';
import { ChatMessageList } from './components/chat-message-list';
import { ChatInput } from './components/chat-input';
import { useChatModelSelection } from './components/chat-model-select';

export function ChatSidebar({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [modelAlias, setModelAlias] = useChatModelSelection('sonnet');
  const [inputValue, setInputValue] = useState('');

  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    api: '/api/chat',
    headers: {
      'x-model-alias': modelAlias,
    },
    onError: (err) => {
      console.error('Chat error:', err);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInputValue('');
  }, [inputValue, isStreaming, sendMessage]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInputValue('');
  }, [setMessages]);

  // Collapsed state — just show a toggle button
  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'fixed bottom-4 right-4 z-50 size-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90',
          className
        )}
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare className="size-5" />
      </Button>
    );
  }

  return (
    <div
      data-slot="chat-sidebar"
      className={cn(
        'flex h-full w-80 shrink-0 flex-col border-l border-border bg-background',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <span className="text-sm font-medium">Chat</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setIsOpen(false)}
            title="Close chat"
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
      <ChatMessageList messages={messages} />

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        onStop={stop}
        isStreaming={isStreaming}
        modelAlias={modelAlias}
        onModelChange={setModelAlias}
      />
    </div>
  );
}
