import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ProjectDetail } from '@/components/views/projects-view/project-detail';

function ProjectDetailRoute() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  return (
    <ProjectDetail projectSlug={slug} onBack={() => navigate({ to: '/project-management' })} />
  );
}

export const Route = createFileRoute('/project-management/$slug')({
  component: ProjectDetailRoute,
});
