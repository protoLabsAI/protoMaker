import { createFileRoute } from '@tanstack/react-router';
import { BoardView } from '@/components/views/board-view';

interface BoardSearchParams {
  featureId?: string;
}

export const Route = createFileRoute('/board')({
  validateSearch: (search: Record<string, unknown>): BoardSearchParams => ({
    featureId: typeof search.featureId === 'string' ? search.featureId : undefined,
  }),
  component: BoardView,
});
