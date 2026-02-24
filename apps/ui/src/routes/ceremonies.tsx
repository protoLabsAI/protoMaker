import { createFileRoute } from '@tanstack/react-router';
import { CeremoniesView } from '@/components/views/ceremonies-view';

export const Route = createFileRoute('/ceremonies')({
  component: CeremoniesView,
});
