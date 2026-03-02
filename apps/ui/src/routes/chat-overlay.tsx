import { createFileRoute } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { ChatOverlayView } from '@/components/views/chat-overlay/chat-overlay-view';

function ChatOverlayPage() {
  const avaChat = useAppStore((s) => s.featureFlags.avaChat);

  if (!avaChat) return null;

  return <ChatOverlayView />;
}

export const Route = createFileRoute('/chat-overlay')({
  component: ChatOverlayPage,
});
