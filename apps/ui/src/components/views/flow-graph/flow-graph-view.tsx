/**
 * FlowGraphView — Main view component
 *
 * Composes data hooks -> canvas + legend overlay.
 * Click any node to open a detail dialog.
 * Floating panels (metrics, health, charts, events) have been moved to the global bottom panel.
 */

import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useFlowGraphData } from './hooks';
import { FlowGraphCanvas } from './flow-graph-canvas';
import { FlowGraphLegend } from './flow-graph-legend';
import { NodeDetailDialog, type SelectedNode } from './dialogs/node-detail-dialog';
import { SignalInputDialog } from './dialogs/signal-input-dialog';
import { PrdReviewDialog } from './dialogs/prd-review-dialog';
import { ContentReviewDialog } from './dialogs/content-review-dialog';
import { getHttpApiClient } from '@/lib/http-api-client';

export interface FlowGraphViewProps {
  projectPath?: string;
  onFeatureClick?: (featureId: string) => void;
}

export function FlowGraphView({ onFeatureClick }: FlowGraphViewProps) {
  const { nodes, edges } = useFlowGraphData();

  // Legend visibility
  const [showLegend, setShowLegend] = useState(false);

  // Node detail dialog state
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Specialized dialogs for specific engine services
  const [signalDialogOpen, setSignalDialogOpen] = useState(false);
  const [prdDialogOpen, setPrdDialogOpen] = useState(false);
  const [prdProjectSlug, setPrdProjectSlug] = useState('');

  // Content review dialog state (driven by WebSocket events)
  const [contentReviewOpen, setContentReviewOpen] = useState(false);
  const [contentReviewData, setContentReviewData] = useState<{
    contentId: string;
    title: string;
    draft: string;
    strategy: string;
  } | null>(null);

  // Subscribe to content:draft-ready WebSocket events
  useEffect(() => {
    const api = getHttpApiClient();
    const unsub = api.subscribeToEvents((type: string, payload: any) => {
      if (type === 'content:draft-ready') {
        setContentReviewData({
          contentId: payload.contentId,
          title: payload.title,
          draft: payload.draft,
          strategy: JSON.stringify(payload.strategy, null, 2),
        });
        setContentReviewOpen(true);
      }
    });
    return () => unsub();
  }, []);

  const handleNodeClick = useCallback(
    (nodeId: string, nodeType: string, nodeData: Record<string, unknown>) => {
      // Intercept clicks on specific engine-service nodes
      if (nodeType === 'engine-service') {
        const serviceId = nodeData.serviceId as string;
        if (serviceId === 'signal-sources') {
          setSignalDialogOpen(true);
          return;
        }
        if (serviceId === 'project-planning' && nodeData.activeProjectSlug) {
          setPrdProjectSlug(nodeData.activeProjectSlug as string);
          setPrdDialogOpen(true);
          return;
        }
      }

      setSelectedNode({ nodeId, nodeType, nodeData });
      setDialogOpen(true);

      // Also fire feature click callback for board navigation
      if (nodeType === 'feature' && onFeatureClick) {
        const featureId = nodeId.replace('feature-', '');
        onFeatureClick(featureId);
      }
    },
    [onFeatureClick]
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <ReactFlowProvider>
        <FlowGraphCanvas
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          showLegend={showLegend}
          onToggleLegend={() => setShowLegend((v) => !v)}
        />
      </ReactFlowProvider>

      {/* Legend popup to the right of controls, near bottom */}
      {showLegend && (
        <div className="absolute bottom-4 left-16 z-10">
          <FlowGraphLegend />
        </div>
      )}

      {/* Node detail dialog */}
      <NodeDetailDialog open={dialogOpen} onOpenChange={setDialogOpen} node={selectedNode} />

      {/* Signal input dialog */}
      <SignalInputDialog open={signalDialogOpen} onOpenChange={setSignalDialogOpen} />

      {/* PRD review dialog */}
      <PrdReviewDialog
        open={prdDialogOpen}
        onOpenChange={setPrdDialogOpen}
        projectSlug={prdProjectSlug}
      />

      {/* Content review dialog (auto-opens via WebSocket) */}
      {contentReviewData && (
        <ContentReviewDialog
          open={contentReviewOpen}
          onOpenChange={setContentReviewOpen}
          contentId={contentReviewData.contentId}
          title={contentReviewData.title}
          draft={contentReviewData.draft}
          strategy={contentReviewData.strategy}
        />
      )}
    </div>
  );
}
