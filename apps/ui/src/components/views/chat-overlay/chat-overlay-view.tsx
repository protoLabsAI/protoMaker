/**
 * ChatOverlayView — Ava Anywhere global chat overlay (Electron window).
 *
 * Renders a full-window chat interface for the Electron overlay panel.
 * The overlay is shown/hidden via global shortcut (Cmd/Ctrl+Shift+Space)
 * managed by Electron main process.
 *
 * In web mode, this route is unused — ChatModal provides the equivalent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getOverlayAPI } from '@/lib/electron';
import { ChatOverlayContent } from './chat-overlay-content';

export function ChatOverlayView() {
  // animClass drives the CSS entrance/exit animation on the wrapper div
  const [animClass, setAnimClass] = useState('');
  const isHidingRef = useRef(false);

  const startHide = useCallback(() => {
    if (isHidingRef.current) return;
    isHidingRef.current = true;
    const bridge = getOverlayAPI();
    // Signal main process so blur handler won't race with our animation
    bridge?.startHide?.();
    setAnimClass('animate-out fade-out slide-out-to-top-2 duration-150 fill-mode-forwards');
    setTimeout(() => {
      bridge?.hideOverlay?.();
      isHidingRef.current = false;
    }, 150);
  }, []);

  // Listen for overlay:did-show from main process to trigger entrance animation
  useEffect(() => {
    const bridge = getOverlayAPI();
    if (!bridge?.onOverlayDidShow) {
      // Web / non-Electron fallback: show immediately
      setAnimClass('animate-in slide-in-from-top-2 fade-in duration-200');
      return;
    }
    const cleanup = bridge.onOverlayDidShow(() => {
      isHidingRef.current = false;
      setAnimClass('animate-in slide-in-from-top-2 fade-in duration-200');
    });
    return cleanup;
  }, []);

  // Listen for overlay:hide-requested (triggered by window blur in main process)
  useEffect(() => {
    const bridge = getOverlayAPI();
    if (!bridge?.onOverlayHideRequested) return;
    const cleanup = bridge.onOverlayHideRequested(() => {
      startHide();
    });
    return cleanup;
  }, [startHide]);

  // When the Electron overlay window is shown again, focus the chat input
  useEffect(() => {
    const handleWindowFocus = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-slot="chat-input"] textarea'
      );
      textarea?.focus();
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

  return (
    <div
      data-slot="chat-overlay"
      className={cn(
        'flex h-screen w-screen flex-col bg-background',
        'overflow-hidden rounded-xl border border-border',
        'will-change-transform',
        animClass
      )}
    >
      <ChatOverlayContent onHide={startHide} />
    </div>
  );
}
