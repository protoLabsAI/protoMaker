import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ProjectWizard } from '@/components/views/projects-view/wizard';

function NewProjectRoute() {
  const navigate = useNavigate();

  return (
    <ProjectWizard projectSlug={null} onBack={() => navigate({ to: '/project-management' })} />
  );
}

export const Route = createFileRoute('/project-management/new')({
  component: NewProjectRoute,
});
