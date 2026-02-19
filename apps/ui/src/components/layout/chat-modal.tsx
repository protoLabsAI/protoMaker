/**
 * ChatModal — Web fallback for the Ava Anywhere chat overlay.
 *
 * In Electron mode, the chat overlay runs in its own window.
 * In web mode, this Dialog-based modal provides the same experience.
 * Triggered via Cmd+K (macOS) or Ctrl+K (Windows/Linux).
 */

import { useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@protolabs/ui/atoms';
import { useChatSession } from '@/hooks/use-chat-session';
import { useChatStore } from '@/store/chat-store';
import { ChatOverlayContent } from '@/components/views/chat-overlay/chat-overlay-content';

export function ChatModal() {
  const chatModalOpen = useChatStore((s) => s.chatModalOpen);
  const setChatModalOpen = useChatStore((s) => s.setChatModalOpen);
  const chatSession = useChatSession({ defaultModel: 'sonnet' });

  const handleClose = useCallback(() => {
    setChatModalOpen(false);
  }, [setChatModalOpen]);

  return (
    <Dialog open={chatModalOpen} onOpenChange={setChatModalOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl h-[70vh] p-0 gap-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Ava Chat</DialogTitle>
        <ChatOverlayContent {...chatSession} onHide={handleClose} isModal />
      </DialogContent>
    </Dialog>
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
