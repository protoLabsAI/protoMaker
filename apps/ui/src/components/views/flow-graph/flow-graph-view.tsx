/**
 * FlowGraphView — Main view component
 *
 * Composes data hooks -> canvas + legend overlay.
 * Click any node to open a detail dialog.
 * Floating panels (metrics, health, charts, events) have been moved to the global bottom panel.
 */

import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useQuery } from '@tanstack/react-query';
import { useFlowGraphData, usePipelineProgress } from './hooks';
import { FlowGraphCanvas } from './flow-graph-canvas';
import { FlowGraphLegend } from './flow-graph-legend';
import { PipelineProgressBar } from './pipeline-progress-bar';
import { PipelineEventLog } from './pipeline-event-log';
import { PipelineAnalytics } from './pipeline-analytics';
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
  const pipeline = usePipelineProgress();

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

  // Load pending drafts on mount (survives page refresh)
  const { data: pendingDraftsData } = useQuery({
    queryKey: ['content-drafts'],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.engine.contentDrafts();
    },
    refetchOnWindowFocus: false,
  });

  // Populate dialog from pending drafts on load
  useEffect(() => {
    if (pendingDraftsData?.drafts?.length && !contentReviewData) {
      const mostRecent = pendingDraftsData.drafts[pendingDraftsData.drafts.length - 1];
      setContentReviewData({
        contentId: mostRecent.contentId,
        title: mostRecent.title,
        draft: mostRecent.draft,
        strategy: JSON.stringify(mostRecent.strategy, null, 2),
      });
      setContentReviewOpen(true);
    }
  }, [pendingDraftsData, contentReviewData]);

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
      {/* Pipeline progress overlay (top bar) */}
      {pipeline.active && pipeline.pipelineState && pipeline.branch && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5">
          <PipelineProgressBar
            pipelineState={pipeline.pipelineState}
            branch={pipeline.branch}
            onResolveGate={pipeline.resolveGate}
          />
          <PipelineEventLog events={pipeline.recentEvents} />
          <PipelineAnalytics />
        </div>
      )}

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
