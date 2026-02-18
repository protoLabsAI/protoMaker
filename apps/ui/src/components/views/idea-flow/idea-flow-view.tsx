/**
 * IdeaFlowView — Top-level view component for idea pipeline
 *
 * Wraps IdeaFlowCanvas with ReactFlowProvider and panel layout.
 * Displays empty state when no sessions exist.
 */

import { ReactFlowProvider } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { IdeaFlowCanvas } from './idea-flow-canvas';
import { useIdeaFlowData } from './hooks/use-idea-flow-data';

export interface IdeaFlowViewProps {
  projectPath?: string;
}

export function IdeaFlowView({ projectPath }: IdeaFlowViewProps) {
  const { nodes, edges, isLoading, error } = useIdeaFlowData(projectPath);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">Failed to load idea sessions</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-muted-foreground">No idea sessions yet</p>
          <p className="text-sm text-muted-foreground">
            Idea sessions will appear here once created
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <ReactFlowProvider>
        <IdeaFlowCanvas nodes={nodes} edges={edges} />
      </ReactFlowProvider>
    </div>
  );
}
