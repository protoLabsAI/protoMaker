/**
 * FlowGraphCanvas — React Flow canvas with Background, MiniMap, and a11y
 *
 * Uses controlled mode — nodes/edges are driven by props.
 * Draggable nodes use onNodesChange to handle position updates.
 */

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';

interface FlowGraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (nodeId: string, nodeType: string, nodeData: Record<string, unknown>) => void;
}

export function FlowGraphCanvas({
  nodes: externalNodes,
  edges: externalEdges,
  onNodeClick,
}: FlowGraphCanvasProps) {
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: false,
        }}
        aria-label="System architecture flow graph"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="oklch(0.4 0 0 / 0.15)"
        />
        <Controls
          showInteractive={false}
          className="!bg-card/90 !border-border/50 !rounded-lg !shadow-lg backdrop-blur-sm [&>button]:!bg-transparent [&>button]:!border-border/30 [&>button]:!text-foreground [&>button:hover]:!bg-accent"
        />
      </ReactFlow>
    </div>
  );
}
