import { createFileRoute } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { IdeaFlowView } from '@/components/views/idea-flow/idea-flow-view';

function IdeasRoute() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  return <IdeaFlowView projectPath={projectPath} />;
}

export const Route = createFileRoute('/ideas')({
  component: IdeasRoute,
});
