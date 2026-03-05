/**
 * useScrollLock — Maintains scroll-to-bottom lock during streaming.
 *
 * Lock is acquired when a new stream starts (isStreaming transitions to true)
 * or when a new message arrives (messageCount increases).
 *
 * useLayoutEffect fires synchronously after DOM mutations and before paint,
 * so the viewport is pinned to the bottom without the 1-frame lag that
 * useEffect + requestAnimationFrame would produce during token streaming.
 *
 * User scrolling up more than SCROLL_RELEASE_THRESHOLD px from the bottom
 * releases the lock so the stream continues in the background undisturbed.
 * The next new stream start or new message automatically re-acquires the lock.
 */

import { useRef, useLayoutEffect, useEffect, type RefObject, type MutableRefObject } from 'react';

/** Distance from bottom (px) that triggers lock release on user scroll-up. */
const SCROLL_RELEASE_THRESHOLD = 50;

/**
 * @param containerRef - Ref to the scrollable container element.
 * @param isStreaming  - True while a message is being streamed.
 * @param messageCount - Total number of messages; increasing value re-acquires lock.
 * @returns lockedRef  - Mutable ref tracking current lock state.
 */
export function useScrollLock(
  containerRef: RefObject<HTMLDivElement | null>,
  {
    isStreaming,
    messageCount,
  }: {
    isStreaming: boolean;
    messageCount: number;
  }
): MutableRefObject<boolean> {
  const lockedRef = useRef(false);
  const prevStreamingRef = useRef(false);
  const prevMessageCountRef = useRef(messageCount);

  // Synchronously scroll to bottom after every render while locked.
  // Re-acquire lock when a new stream starts or a new message arrives.
  // Runs without deps array so it executes after every render — this ensures
  // every batch of streaming tokens gets a pre-paint scroll correction.
  useLayoutEffect(() => {
    const streamStarted = isStreaming && !prevStreamingRef.current;
    const newMessage = messageCount > prevMessageCountRef.current;

    if (streamStarted || newMessage) {
      lockedRef.current = true;
    }

    prevStreamingRef.current = isStreaming;
    prevMessageCountRef.current = messageCount;

    if (lockedRef.current) {
      const el = containerRef.current;
      if (el) {
        // Direct assignment is synchronous and avoids smooth-scroll fighting
        // with concurrent wheel/touch input.
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    }
  });

  // Release lock when the user scrolls up more than SCROLL_RELEASE_THRESHOLD
  // from the bottom. Scroll events triggered by our own programmatic scrollTop
  // assignments land at distFromBottom ≈ 0 and therefore do NOT release the lock.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom > SCROLL_RELEASE_THRESHOLD) {
        lockedRef.current = false;
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [containerRef]);

  return lockedRef;
}
