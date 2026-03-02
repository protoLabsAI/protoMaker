/**
 * ChatMessageList — Scrollable message container with stick-to-bottom behaviour.
 *
 * Automatically follows new content while the user is at the bottom.
 * When the user scrolls up, auto-scroll pauses without interruption.
 * A "scroll to bottom" button re-appears whenever the view is not at the bottom.
 *
 * Implementation notes:
 *  - MutationObserver watches the content node for any DOM changes (streaming
 *    tokens) and scrolls only when the user has NOT manually scrolled away.
 *  - The messages.length effect only scrolls when the user is still at the
 *    bottom, so a manually-scrolled-up view is never hijacked.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '../lib/utils.js';
import { Button } from '../atoms/button.js';
import { ChatMessage } from './chat-message.js';
import { ShimmerLoader } from './shimmer.js';

export function ChatMessageList({
  messages,
  emptyMessage = 'Start a conversation...',
  className,
  isStreaming,
  onRegenerate,
  onThumbsUp,
  onThumbsDown,
}: {
  messages: UIMessage[];
  emptyMessage?: string;
  className?: string;
  /** When true, shows a ShimmerLoader at the bottom if the last message has no text yet. */
  isStreaming?: boolean;
  /** Called when the user clicks Regenerate on an assistant message. */
  onRegenerate?: () => void;
  /** Called when the user clicks Thumbs Up on an assistant message. */
  onThumbsUp?: () => void;
  /** Called when the user clicks Thumbs Down on an assistant message. */
  onThumbsDown?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userScrolledRef = useRef(false);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    userScrolledRef.current = false;
    setIsAtBottom(true);
  }, []);

  // Track scroll position to show/hide the scroll-to-bottom button
  // and determine whether auto-scroll should fire.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      if (atBottom) {
        userScrolledRef.current = false;
      }
      // Only mark as "user scrolled" when moving away from bottom.
      // We detect this by checking if the user is NOT at bottom; the ref
      // is cleared whenever we scroll back to the bottom programmatically
      // or the user scrolls back themselves.
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  // Detect scroll-up gestures via wheel/touch to set the userScrolled flag.
  // This ensures we can distinguish user intent from programmatic scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const markUserScrolled = () => {
      if (!checkIfAtBottom()) {
        userScrolledRef.current = true;
      }
    };

    el.addEventListener('wheel', markUserScrolled, { passive: true });
    el.addEventListener('touchmove', markUserScrolled, { passive: true });
    return () => {
      el.removeEventListener('wheel', markUserScrolled);
      el.removeEventListener('touchmove', markUserScrolled);
    };
  }, [checkIfAtBottom]);

  // Auto-scroll on streaming content changes (MutationObserver).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      if (!userScrolledRef.current) {
        scrollToBottom('smooth');
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [scrollToBottom]);

  // When a new message is appended, scroll to bottom only if the user
  // has not manually scrolled away. This prevents hijacking reading position
  // during long conversations / streaming.
  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom('instant');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Determine if ShimmerLoader should be shown:
  // Show when streaming and the last message has no text content yet (pending response).
  const lastMessage = messages[messages.length - 1];
  const lastMessageHasNoText =
    !lastMessage ||
    !(lastMessage.parts ?? []).some(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && !!(p as { type: 'text'; text: string }).text
    );
  const showShimmer = !!isStreaming && lastMessageHasNoText;

  return (
    <div data-slot="chat-message-list" className={cn('relative flex-1 overflow-hidden', className)}>
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div ref={contentRef} className="space-y-1 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onRegenerate={onRegenerate}
                onThumbsUp={onThumbsUp}
                onThumbsDown={onThumbsDown}
              />
            ))
          )}
          {showShimmer && <ShimmerLoader />}
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
