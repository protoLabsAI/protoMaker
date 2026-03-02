/**
 * FlowDetailPanel — Interactive LangGraph topology viewer with real-time node highlighting
 *
 * Opens when clicking an engine service node that has an associated flow.
 * Uses dagre for hierarchical layout and React Flow for rendering.
 */

import { useMemo, useCallback } from 'react';
import { ReactFlow, Node, Edge, Background, Controls, Panel } from '@xyflow/react';
import { X } from 'lucide-react';
import dagre from 'dagre';
import { motion, AnimatePresence } from 'motion/react';
import { useFlowDefinition, type GraphDefinition } from '../hooks/use-flow-definition';
import { useFlowExecution } from '../hooks/use-flow-execution';
import { cn } from '@/lib/utils';

import '@xyflow/react/dist/style.css';

/**
 * Dagre layout configuration
 */
const LAYOUT_CONFIG = {
  rankdir: 'TB' as const, // Top to bottom
  ranksep: 80,
  nodesep: 40,
};

/**
 * Convert GraphDefinition to React Flow format with dagre layout
 */
function layoutGraph(graph: GraphDefinition): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph(LAYOUT_CONFIG);
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: 180, height: 60 });
  }

  // Add edges to dagre
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Compute layout
  dagre.layout(g);

  // Convert to React Flow format
  const nodes: Node[] = graph.nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      id: node.id,
      type: 'default',
      position: {
        x: dagreNode.x - dagreNode.width / 2,
        y: dagreNode.y - dagreNode.height / 2,
      },
      data: { label: node.label },
      draggable: false,
    };
  });

  const edges: Edge[] = graph.edges.map((edge, idx) => ({
    id: `e-${edge.source}-${edge.target}-${idx}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: false,
  }));

  return { nodes, edges };
}

interface FlowDetailPanelProps {
  /** The graph ID to display */
  graphId: string;
  /** Feature ID for real-time execution tracking (optional) */
  featureId?: string;
  /** Called when user closes the panel */
  onClose: () => void;
}

/**
 * FlowDetailPanel component
 */
export function FlowDetailPanel({ graphId, featureId, onClose }: FlowDetailPanelProps) {
  const { data: graphDef, isLoading, error } = useFlowDefinition(graphId);
  const { currentNode, completedNodes } = useFlowExecution(featureId, !!featureId);

  // Compute layout and apply highlighting
  const { nodes, edges } = useMemo(() => {
    if (!graphDef) {
      return { nodes: [], edges: [] };
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutGraph(graphDef);

    // Apply real-time highlighting
    const highlightedNodes = layoutedNodes.map((node) => {
      const isActive = currentNode === node.id;
      const isCompleted = completedNodes.includes(node.id);

      return {
        ...node,
        style: {
          ...node.style,
          opacity: isCompleted ? 0.5 : 1,
          backgroundColor: isActive ? '#8b5cf6' : isCompleted ? '#22c55e' : '#3f3f46',
          color: 'white',
          borderColor: isActive ? '#a78bfa' : '#52525b',
          borderWidth: isActive ? 2 : 1,
          boxShadow: isActive ? '0 0 20px rgba(139, 92, 246, 0.5)' : undefined,
        },
      };
    });

    return { nodes: highlightedNodes, edges: layoutedEdges };
  }, [graphDef, currentNode, completedNodes]);

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    // Prevent closing when clicking inside the panel
    event.stopPropagation();
  }, []);

  if (isLoading) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-card border border-border rounded-lg p-8 shadow-2xl"
            onClick={handlePaneClick}
          >
            <p className="text-muted-foreground">Loading flow definition...</p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (error || !graphDef) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-card border border-border rounded-lg p-8 shadow-2xl max-w-md"
            onClick={handlePaneClick}
          >
            <p className="text-red-400 mb-4">Failed to load flow definition</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="absolute inset-8 bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
          onClick={handlePaneClick}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/95 backdrop-blur-sm">
            <div>
              <h2 className="text-lg font-semibold">{graphDef.name}</h2>
              {graphDef.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{graphDef.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg',
                'hover:bg-zinc-800 transition-colors',
                'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* React Flow Canvas */}
          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              attributionPosition="bottom-left"
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />

              {/* Legend */}
              <Panel
                position="top-right"
                className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 text-xs"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-violet-600 border-2 border-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                    <span className="text-muted-foreground">Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-600" />
                    <span className="text-muted-foreground">Completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-zinc-700" />
                    <span className="text-muted-foreground">Pending</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
