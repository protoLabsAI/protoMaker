/**
 * IdeaFlowView — Top-level view component for idea pipeline
 *
 * Wraps IdeaFlowCanvas with ReactFlowProvider and panel layout.
 * Displays empty state when no sessions exist.
 * Includes IdeaDetailPanel overlay for selected session details.
 */

import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { IdeaFlowCanvas } from './idea-flow-canvas';
import { useIdeaFlowData } from './hooks/use-idea-flow-data';
import { IdeaDetailPanel } from './panels/idea-detail-panel';

export interface IdeaFlowViewProps {
  projectPath?: string;
}

export function IdeaFlowView({ projectPath }: IdeaFlowViewProps) {
  const { nodes, edges, isLoading, error } = useIdeaFlowData(projectPath);

  // Detail panel state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<Record<string, unknown> | null>(null);

  // Fetch session data when a node is clicked
  useEffect(() => {
    if (!selectedSessionId) {
      setSessionData(null);
      return;
    }

    const fetchSessionData = async () => {
      try {
        const response = await fetch('/api/ideas/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: selectedSessionId }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.session) {
            setSessionData(data.session);
          }
        }
      } catch {
        // Silent fail — panel will show loading state
      }
    };

    void fetchSessionData();
  }, [selectedSessionId]);

  // Handle node click → open detail panel
  const handleNodeClick = useCallback(
    (nodeId: string, nodeType: string, nodeData: Record<string, unknown>) => {
      const sessionId = (nodeData.sessionId as string) || nodeId;
      setSelectedSessionId(sessionId);
    },
    []
  );

  // Close detail panel
  const handleClosePanel = useCallback(() => {
    setSelectedSessionId(null);
    setSessionData(null);
  }, []);

  // Escape key closes panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSessionId) {
        handleClosePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSessionId, handleClosePanel]);

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
        <IdeaFlowCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
      </ReactFlowProvider>

      {/* Detail Panel — floating overlay for selected session */}
      {selectedSessionId && (
        <IdeaDetailPanel
          sessionId={selectedSessionId}
          sessionData={sessionData}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}
