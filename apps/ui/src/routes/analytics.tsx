import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsView } from '@/components/views/analytics-view';
import { z } from 'zod';

const analyticsSearchSchema = z.object({
  tab: z.enum(['system', 'ideas']).optional().default('system'),
});

export const Route = createFileRoute('/analytics')({
  component: AnalyticsView,
  validateSearch: analyticsSearchSchema,
});
