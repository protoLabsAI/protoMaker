import { createFileRoute } from '@tanstack/react-router';
import { InboxView } from '@/components/views/inbox-view';

export const Route = createFileRoute('/inbox')({
  component: InboxView,
});
