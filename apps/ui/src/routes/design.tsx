import { createFileRoute } from '@tanstack/react-router';
import { DesignView } from '@/components/views/design-view/design-view';

export const Route = createFileRoute('/design')({
  component: DesignView,
});
