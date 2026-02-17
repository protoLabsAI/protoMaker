/**
 * FlowGraphView — Main view component
 *
 * Composes data hooks -> canvas + floating panels.
 * Handles feature node click -> edit dialog.
 */

import { useCallback, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useFlowGraphData } from './hooks';
import { FlowGraphCanvas } from './flow-graph-canvas';
import { MetricsPanel } from './panels/metrics-panel';
import { HealthPanel } from './panels/health-panel';
import { ChartsPanel } from './panels/charts-panel';
import { PanelToolbar } from './panels/panel-toolbar';
import { FlowGraphLegend } from './flow-graph-legend';

export interface FlowGraphViewProps {
  projectPath?: string;
  onFeatureClick?: (featureId: string) => void;
}

export function FlowGraphView({ projectPath, onFeatureClick }: FlowGraphViewProps) {
  const { nodes, edges } = useFlowGraphData();

  // Panel visibility state
  const [showMetrics, setShowMetrics] = useState(true);
  const [showHealth, setShowHealth] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  const handleNodeClick = useCallback(
    (nodeId: string, nodeType: string) => {
      if (nodeType === 'feature' && onFeatureClick) {
        // Extract feature ID from node ID: "feature-{id}" -> "{id}"
        const featureId = nodeId.replace('feature-', '');
        onFeatureClick(featureId);
      }
    },
    [onFeatureClick]
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      <ReactFlowProvider>
        <FlowGraphCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
      </ReactFlowProvider>

      {/* Floating panel toolbar */}
      <div className="absolute top-4 right-4 z-10">
        <PanelToolbar
          showMetrics={showMetrics}
          showHealth={showHealth}
          showCharts={showCharts}
          showLegend={showLegend}
          onToggleMetrics={() => setShowMetrics((v) => !v)}
          onToggleHealth={() => setShowHealth((v) => !v)}
          onToggleCharts={() => setShowCharts((v) => !v)}
          onToggleLegend={() => setShowLegend((v) => !v)}
        />
      </div>

      {/* Floating panels */}
      {showMetrics && (
        <div className="absolute top-16 right-4 z-10 w-72">
          <MetricsPanel projectPath={projectPath} />
        </div>
      )}

      {showHealth && (
        <div className="absolute top-16 left-4 z-10 w-64">
          <HealthPanel projectPath={projectPath} />
        </div>
      )}

      {showCharts && (
        <div className="absolute bottom-4 right-4 z-10 w-96">
          <ChartsPanel projectPath={projectPath} />
        </div>
      )}

      {showLegend && (
        <div className="absolute bottom-4 left-4 z-10">
          <FlowGraphLegend />
        </div>
      )}
    </div>
  );
}
