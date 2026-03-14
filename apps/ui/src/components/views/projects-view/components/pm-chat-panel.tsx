/**
 * PmChatPanel — Slide-out PM agent chat panel for the project detail view.
 *
 * Fixed to the right side of the screen with a translate-x transition.
 * Shows: header (project name + status badge + close), scrollable message list,
 * input bar at bottom.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Send, Square } from 'lucide-react';
import { Badge, Button, ScrollArea, Textarea } from '@protolabsai/ui/atoms';
import { ChatMessageMarkdown } from '@protolabsai/ui/ai';
import { cn } from '@/lib/utils';
import { usePmChat } from '@/hooks/use-pm-chat';
import { getProjectStatusVariant } from '../lib/status-variants';
import type { Project } from '@protolabsai/types';

interface PmChatPanelProps {
  project: Project;
  projectPath: string;
  open: boolean;
  onClose: () => void;
}

export function PmChatPanel({ project, projectPath, open, onClose }: PmChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, stop, isStreaming } = usePmChat({
    projectPath,
    projectSlug: project.slug,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    void sendMessage({ text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/20 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 w-96 flex flex-col bg-background border-l border-border shadow-xl',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-label="PM Chat"
        aria-modal="true"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border/60">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {project.title}
              </span>
              <Badge
                variant={getProjectStatusVariant(project.status)}
                size="sm"
                className="uppercase tracking-wider shrink-0"
              >
                {project.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">PM Agent</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close PM chat"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-3 p-4">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Ask the PM agent anything about this project.
              </p>
            )}
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-3 py-2 bg-primary text-primary-foreground text-sm">
                      {msg.parts
                        .filter((p) => p.type === 'text')
                        .map((p, i) => (
                          <span key={i}>{p.type === 'text' ? p.text : null}</span>
                        ))}
                    </div>
                  </div>
                );
              }

              if (msg.role === 'assistant') {
                const textParts = msg.parts.filter((p) => p.type === 'text');
                if (textParts.length === 0) return null;
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 bg-muted text-foreground text-sm">
                      {textParts.map((p, i) => (
                        <ChatMessageMarkdown key={i} content={p.type === 'text' ? p.text : ''} />
                      ))}
                    </div>
                  </div>
                );
              }

              // system / tool messages — centered muted
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
                    {msg.role}: {msg.id}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input bar */}
        <div className="shrink-0 border-t border-border/60 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message PM agent..."
              className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
              disabled={isStreaming}
              rows={1}
            />
            {isStreaming ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={stop}
                aria-label="Stop generation"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSubmit}
                disabled={!input.trim()}
                aria-label="Send message"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
