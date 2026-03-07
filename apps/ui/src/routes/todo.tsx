import { createFileRoute } from '@tanstack/react-router';
import { TodoView } from '@/components/views/todo-view';

export const Route = createFileRoute('/todo')({
  component: TodoView,
});
