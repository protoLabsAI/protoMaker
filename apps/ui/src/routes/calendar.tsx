import { createFileRoute } from '@tanstack/react-router';
import { CalendarView } from '@/components/views/calendar-view';

export const Route = createFileRoute('/calendar')({
  component: CalendarView,
});
