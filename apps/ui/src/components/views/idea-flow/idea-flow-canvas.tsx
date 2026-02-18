/**
 * IdeaFlowCanvas — React Flow canvas for idea pipeline visualization
 *
 * Uses controlled mode with nodeTypes/edgeTypes registration.
 * Renders the idea intake and pipeline flow with draggable nodes.
 */

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ideaFlowNodeTypes } from './nodes';
import { edgeTypes } from './edges';

interface IdeaFlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (nodeId: string, nodeType: string, nodeData: Record<string, unknown>) => void;
}

export function IdeaFlowCanvas({
  nodes: externalNodes,
  edges: externalEdges,
  onNodeClick,
}: IdeaFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(externalNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(externalEdges);

  // Sync external data changes into React Flow state
  useEffect(() => {
    setNodes(externalNodes);
  }, [externalNodes, setNodes]);

  useEffect(() => {
    setEdges(externalEdges);
  }, [externalEdges, setEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id, node.type || '', node.data as Record<string, unknown>);
    },
    [onNodeClick]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange<Node>}
        onEdgesChange={onEdgesChange as OnEdgesChange<Edge>}
        onNodeClick={handleNodeClick}
        nodeTypes={ideaFlowNodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: false,
        }}
        aria-label="Idea pipeline flow graph"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="oklch(0.4 0 0 / 0.15)"
        />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-card/80 !border-border/50 !rounded-lg backdrop-blur-sm"
          maskColor="oklch(0.15 0 0 / 0.7)"
        />
        <Controls
          showInteractive={false}
          className="!bg-card/90 !border-border/50 !rounded-lg !shadow-lg backdrop-blur-sm [&>button]:!bg-transparent [&>button]:!border-border/30 [&>button]:!text-foreground [&>button:hover]:!bg-accent"
        />
      </ReactFlow>
    </div>
  );
}
