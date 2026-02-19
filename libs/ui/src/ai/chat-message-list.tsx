/**
 * ChatMessageList — Scrollable message container with auto-scroll.
 *
 * Uses MutationObserver to auto-scroll on new content unless user has scrolled up.
 * Shows a "scroll to bottom" button when not at bottom.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '../lib/utils.js';
import { Button } from '../atoms/button.js';
import { ChatMessage } from './chat-message.js';

export function ChatMessageList({
  messages,
  emptyMessage = 'Start a conversation...',
  className,
}: {
  messages: UIMessage[];
  emptyMessage?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setUserScrolled(false);
  }, []);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      if (!atBottom) {
        setUserScrolled(true);
      } else {
        setUserScrolled(false);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      if (!userScrolled) {
        scrollToBottom('smooth');
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [userScrolled, scrollToBottom]);

  useEffect(() => {
    scrollToBottom('instant');
  }, [messages.length, scrollToBottom]);

  return (
    <div data-slot="chat-message-list" className={cn('relative flex-1 overflow-hidden', className)}>
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div ref={contentRef} className="space-y-1 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}
        </div>
      </div>

      {!isAtBottom && messages.length > 0 && (
        <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full shadow-md"
            onClick={() => scrollToBottom()}
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
