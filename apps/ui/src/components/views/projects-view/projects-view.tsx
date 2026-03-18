import { Outlet, useChildMatches } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { ProjectDashboard } from './project-dashboard';

export function ProjectsView() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const childMatches = useChildMatches();

  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Open a project to view its plans.</p>
      </div>
    );
  }

  // Child routes (slug, new) render via Outlet
  if (childMatches.length > 0) {
    return <Outlet />;
  }

  return <ProjectDashboard />;
}
