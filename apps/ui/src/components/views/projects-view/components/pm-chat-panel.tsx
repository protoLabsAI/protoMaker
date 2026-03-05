/**
 * PmChatPanel — Slide-out PM chat panel for a project.
 *
 * Fixed to the right side, slides in/out using translate-x transition.
 * Shows user/assistant/system messages and an input bar for sending messages.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { Badge } from '@protolabsai/ui/atoms';
import { Button } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { usePmChat } from '@/hooks/use-pm-chat';
import type { Project } from '@protolabsai/types';

interface PmChatPanelProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  projectPath: string;
  ceremonyPhase?: string;
}

export function PmChatPanel({
  open,
  onClose,
  project,
  projectPath,
  ceremonyPhase,
}: PmChatPanelProps) {
  const { messages, sendMessage, stop, isStreaming, error } = usePmChat({
    projectPath,
    projectSlug: project.slug,
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Escape key closes panel
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || isStreaming) return;
      sendMessage({ text });
      setInput('');
    },
    [input, isStreaming, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div
      data-testid="pm-chat-panel"
      className={cn(
        'fixed right-0 top-0 h-full w-96 z-50',
        'flex flex-col bg-background border-l border-border/40',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border/40">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{project.title}</span>
            {ceremonyPhase && (
              <Badge variant="secondary" size="sm" className="uppercase tracking-wider shrink-0">
                {ceremonyPhase}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">PM Chat</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close PM chat panel"
          data-testid="pm-chat-close"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-3 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20">
          {error.message || 'An error occurred'}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">
            Ask the PM anything about this project...
          </p>
        )}
        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg px-3 py-2 bg-primary text-primary-foreground text-sm">
                  {message.parts
                    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                    .map((p, i) => (
                      <span key={i}>{p.text}</span>
                    ))}
                </div>
              </div>
            );
          }

          if (message.role === 'system') {
            return (
              <div key={message.id} className="flex justify-center">
                <span className="text-xs text-muted-foreground">
                  {message.parts
                    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                    .map((p, i) => (
                      <span key={i}>{p.text}</span>
                    ))}
                </span>
              </div>
            );
          }

          // assistant
          return (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-3 py-2 bg-muted text-foreground text-sm">
                {message.parts
                  ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map((p, i) => (
                    <span key={i}>{p.text}</span>
                  ))}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border/40 p-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the PM..."
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-md border border-input bg-background px-3 py-2',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'max-h-32 overflow-y-auto'
            )}
            style={{ minHeight: '36px' }}
            disabled={isStreaming}
            data-testid="pm-chat-input"
          />
          {isStreaming ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={stop}
              aria-label="Stop streaming"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim()}
              aria-label="Send message"
              data-testid="pm-chat-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </form>
        <p className="text-xs text-muted-foreground mt-1.5 text-right">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
