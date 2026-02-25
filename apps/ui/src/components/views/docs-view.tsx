import { BookOpen } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function DocsView() {
  const currentProject = useAppStore((s) => s.currentProject);

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Select a project to view docs</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <BookOpen className="size-4 text-primary" />
        <h1 className="text-sm font-medium">Docs</h1>
      </div>

      {/* Placeholder content */}
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>Docs view - Coming soon</p>
      </div>
    </div>
  );
}
