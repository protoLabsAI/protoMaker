import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Spinner } from '@protolabsai/ui/atoms';
import { useProject } from '@/components/views/projects-view/hooks/use-project';
import { ProjectWizard } from '@/components/views/projects-view/wizard';
import { ActiveProjectView } from '@/components/views/projects-view/wizard/active-project-view';

const ACTIVE_STATUSES = ['active', 'completed', 'ongoing'];

function ProjectSlugRoute() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(slug);

  const onBack = () => navigate({ to: '/project-management' });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Active/completed projects show monitoring dashboard
  if (project && ACTIVE_STATUSES.includes(project.status ?? '')) {
    return <ActiveProjectView project={project} projectSlug={slug} onBack={onBack} />;
  }

  // Pipeline projects (pre-active) show the wizard
  return <ProjectWizard projectSlug={slug} onBack={onBack} />;
}

export const Route = createFileRoute('/project-management/$slug')({
  component: ProjectSlugRoute,
});
