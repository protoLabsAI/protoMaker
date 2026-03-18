import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Spinner } from '@protolabsai/ui/atoms';
import { useProject } from '@/components/views/projects-view/hooks/use-project';
import { ProjectWizard } from '@/components/views/projects-view/wizard';
import { ActiveProjectView } from '@/components/views/projects-view/wizard/active-project-view';

/** Wizard only for genuinely new projects that have no meaningful data yet */
const WIZARD_STATUSES = ['drafting', 'researching'];

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

  // New/drafting projects with no PRD or milestones get the wizard
  const isNewProject =
    project &&
    WIZARD_STATUSES.includes(project.status ?? '') &&
    !project.prd &&
    (!project.milestones || project.milestones.length === 0);

  if (isNewProject) {
    return <ProjectWizard projectSlug={slug} onBack={onBack} />;
  }

  // Everything else gets the full detail view
  if (project) {
    return <ActiveProjectView project={project} projectSlug={slug} onBack={onBack} />;
  }

  return <ProjectWizard projectSlug={slug} onBack={onBack} />;
}

export const Route = createFileRoute('/project-management/$slug')({
  component: ProjectSlugRoute,
});
