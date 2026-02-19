/**
 * FlowGraphView — Main view component
 *
 * Composes data hooks -> canvas + legend overlay.
 * Click any node to open a detail dialog.
 * Floating panels (metrics, health, charts, events) have been moved to the global bottom panel.
 */

import { useCallback, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useFlowGraphData } from './hooks';
import { FlowGraphCanvas } from './flow-graph-canvas';
import { FlowGraphLegend } from './flow-graph-legend';
import { NodeDetailDialog, type SelectedNode } from './dialogs/node-detail-dialog';

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

  const handleNodeClick = useCallback(
    (nodeId: string, nodeType: string, nodeData: Record<string, unknown>) => {
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

      {/* Legend popup near controls (bottom-left) */}
      {showLegend && (
        <div className="absolute bottom-14 left-4 z-10">
          <FlowGraphLegend />
        </div>
      )}

      {/* Node detail dialog */}
      <NodeDetailDialog open={dialogOpen} onOpenChange={setDialogOpen} node={selectedNode} />
    </div>
  );
}
