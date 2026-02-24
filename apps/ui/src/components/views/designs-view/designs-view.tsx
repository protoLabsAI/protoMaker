import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { useDesignsStore } from '@/store/designs-store';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { DesignsTree } from './designs-tree';
import { DesignsCanvas } from './designs-canvas';
import { FileText } from 'lucide-react';

export function DesignsView() {
  const { currentProject } = useAppStore();
  const { selectedFilePath, selectedDocument, isLoadingDocument, reset } = useDesignsStore();

  // Reset store when project changes or component unmounts
  useEffect(() => {
    return () => reset();
  }, [currentProject?.path, reset]);

  // Show empty state if no project
  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium">No Project Open</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Open a project to view its design files
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - File tree */}
        <div className="w-64 border-r border-border bg-background overflow-y-auto">
          <DesignsTree projectPath={currentProject.path} />
        </div>

        {/* Right pane - Canvas/Document viewer */}
        <div className="flex-1 flex flex-col">
          {/* Canvas header */}
          {selectedFilePath && (
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <h2 className="text-sm font-medium truncate">{selectedFilePath.split('/').pop()}</h2>
            </div>
          )}

          {/* Canvas content */}
          <div className="flex-1 flex items-center justify-center">
            {isLoadingDocument ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size="lg" />
                <p className="text-sm text-muted-foreground">Loading design...</p>
              </div>
            ) : selectedDocument ? (
              <DesignsCanvas penFile={selectedDocument} />
            ) : (
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No Design Selected</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a .pen file from the tree to view it
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
