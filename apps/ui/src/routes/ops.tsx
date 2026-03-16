import { createFileRoute } from '@tanstack/react-router';
import { OpsView } from '@/components/views/ops-view';

export const Route = createFileRoute('/ops')({
  component: OpsView,
});
