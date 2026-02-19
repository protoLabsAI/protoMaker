/**
 * ChatOverlayView — Ava Anywhere global chat overlay (Electron window).
 *
 * Renders a full-window chat interface for the Electron overlay panel.
 * The overlay is shown/hidden via global shortcut (Cmd/Ctrl+Shift+Space)
 * managed by Electron main process.
 *
 * In web mode, this route is unused — ChatModal provides the equivalent.
 */

import { useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { useChatSession } from '@/hooks/use-chat-session';
import { ChatOverlayContent } from './chat-overlay-content';

export function ChatOverlayView() {
  const chatSession = useChatSession({ defaultModel: 'sonnet' });
  const { historyOpen, setHistoryOpen } = chatSession;

  const handleHide = useCallback(() => {
    if (isElectron()) {
      getElectronAPI()?.hideOverlay?.();
    }
  }, []);

  // Escape key hides the overlay (or closes history panel first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (historyOpen) {
          setHistoryOpen(false);
        } else {
          handleHide();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHide, historyOpen, setHistoryOpen]);

  return (
    <div
      data-slot="chat-overlay"
      className={cn(
        'flex h-screen w-screen flex-col bg-background',
        'overflow-hidden rounded-xl border border-border'
      )}
    >
      <ChatOverlayContent {...chatSession} onHide={handleHide} />
    </div>
  );
}
