import { useRef, useEffect, useCallback } from 'react';

export function useScrollLock() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      lockedRef.current = distanceFromBottom < 100;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    const el = containerRef.current;
    if (!el) return;
    if (force || lockedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return { containerRef, scrollToBottom };
}
