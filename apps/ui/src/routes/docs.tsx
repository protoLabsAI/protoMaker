import { createFileRoute } from '@tanstack/react-router';
import { DocsView } from '@/components/views/docs-view';

export const Route = createFileRoute('/docs')({
  component: DocsView,
});
