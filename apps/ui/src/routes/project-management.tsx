import { createFileRoute } from '@tanstack/react-router';
import { ProjectsView } from '@/components/views/projects-view';

export const Route = createFileRoute('/project-management')({
  component: ProjectsView,
});
