/**
 * ChatModal — Persistent Ava chat panel.
 *
 * Always mounted so that streaming continues in the background when the
 * user closes the panel.  Visibility is toggled via CSS (opacity + pointer-events),
 * NOT via mount/unmount.  This keeps the `useChat` hook alive and the SSE fetch
 * stream connected even while the panel is hidden.
 *
 * When Ava is streaming and the panel is closed, a small floating badge appears
 * so the user knows work is in progress and can click to re-open.
 *
 * Triggered via Cmd+K (macOS) or Ctrl+K (Windows/Linux).
 */

import { useCallback, useEffect } from 'react';
import { useChatStore } from '@/store/chat-store';
import { ChatOverlayContent } from '@/components/views/chat-overlay/chat-overlay-content';
import { cn } from '@/lib/utils';

export function ChatModal() {
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);
  const sessionStreamingMap = useChatStore((s) => s.sessionStreamingMap);
  const streamingCount = Object.values(sessionStreamingMap).filter(Boolean).length;

  const handleClose = useCallback(() => {
    setChatModalOpen(false);
  }, [setChatModalOpen]);

  // Auto-focus chat input when panel opens
  useEffect(() => {
    if (chatModalOpen) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLTextAreaElement>('[data-slot="chat-input"] textarea')?.focus();
      });
    }
  }, [chatModalOpen]);

  return (
    <>
      {/* Backdrop — only rendered when panel is open */}
      {chatModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Chat panel — always mounted so streaming persists in background */}
      <div
        role="dialog"
        aria-label="Ava Chat"
        aria-modal={chatModalOpen}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          'flex flex-col w-full max-w-[min(42rem,calc(100%-2rem))] h-[70vh] max-h-[calc(100vh-4rem)]',
          'bg-card border border-border rounded-xl shadow-2xl overflow-hidden',
          'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]',
          'transition-[opacity,transform] duration-200',
          chatModalOpen
            ? 'visible opacity-100 scale-100'
            : 'invisible opacity-0 scale-95 pointer-events-none'
        )}
      >
        <ChatOverlayContent onHide={handleClose} isModal isOpen={chatModalOpen} />
      </div>

      {/* Streaming indicator — visible when panel is closed but Ava is working */}
      {!chatModalOpen && streamingCount > 0 && (
        <button
          type="button"
          onClick={() => setChatModalOpen(true)}
          className={cn(
            'fixed bottom-4 right-4 z-40 flex items-center gap-2',
            'rounded-full bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium',
            'shadow-lg hover:bg-primary/90 transition-colors cursor-pointer',
            'animate-in fade-in-0 slide-in-from-bottom-2 duration-300'
          )}
          title="Ava is working — click to view (Ctrl+K)"
        >
          <span className="size-2 rounded-full bg-primary-foreground animate-pulse" />
          {streamingCount > 1 ? `Ava is working (${streamingCount} sessions)` : 'Ava is working...'}
        </button>
      )}
    </>
  );
}

/**
 * useChatModalShortcut — Global keyboard shortcut for the chat modal.
 *
 * Registers Cmd+K (macOS) / Ctrl+K (other) to toggle the chat modal.
 * Should be called once in the root layout.
 */
export function useChatModalShortcut() {
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setChatModalOpen(!chatModalOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatModalOpen, setChatModalOpen]);
}
