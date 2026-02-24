import { createFileRoute } from '@tanstack/react-router';
import { DesignsView } from '@/components/views/designs-view';

export const Route = createFileRoute('/designs')({
  component: DesignsView,
});
