import { createFileRoute } from '@tanstack/react-router';
import { GitHubView } from '@/components/views/github-view';

export const Route = createFileRoute('/github')({
  component: GitHubView,
});
