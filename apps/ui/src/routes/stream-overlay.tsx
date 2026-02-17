import { createFileRoute } from '@tanstack/react-router';
import { StreamOverlayView } from '@/components/views/stream-overlay-view';

export const Route = createFileRoute('/stream-overlay')({
  component: StreamOverlayView,
});
