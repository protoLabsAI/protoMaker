import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { ProjectsList } from './projects-list';
import { ProjectDetail } from './project-detail';

export function ProjectsView() {
  const projectPath = useAppStore((s) => s.currentProject?.path);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Open a project to view its plans.</p>
      </div>
    );
  }

  if (selectedSlug) {
    return <ProjectDetail projectSlug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
  }

  return <ProjectsList onSelect={setSelectedSlug} />;
}
