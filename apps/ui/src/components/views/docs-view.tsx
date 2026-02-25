import { useState } from 'react';
import { Library } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { DocsFileTree } from './docs-view/docs-file-tree';
import { DocsContentPanel } from './docs-view/docs-content-panel';

export function DocsView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

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
        <Library className="size-4 text-primary" />
        <h1 className="text-sm font-medium">Docs</h1>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: file tree, fixed width */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-border">
          <DocsFileTree selectedPath={selectedPath} onSelect={setSelectedPath} />
        </div>

        {/* Right panel: content, fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <DocsContentPanel selectedPath={selectedPath} />
        </div>
      </div>
    </div>
  );
}
