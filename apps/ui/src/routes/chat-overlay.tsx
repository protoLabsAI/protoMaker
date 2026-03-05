import { createFileRoute } from '@tanstack/react-router';
import { ChatOverlayView } from '@/components/views/chat-overlay/chat-overlay-view';

export const Route = createFileRoute('/chat-overlay')({
  component: ChatOverlayView,
});
