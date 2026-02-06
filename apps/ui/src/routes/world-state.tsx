import { createFileRoute } from '@tanstack/react-router';
import { WorldStateView } from '@/components/views/world-state-view';

export const Route = createFileRoute('/world-state')({
  component: WorldStateView,
});
