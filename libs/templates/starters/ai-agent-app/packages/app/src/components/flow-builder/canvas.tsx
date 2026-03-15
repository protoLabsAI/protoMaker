/**
 * canvas.tsx — React Flow canvas for the visual flow builder.
 *
 * Renders the interactive graph editor. Supports:
 *   - All five custom node types
 *   - Drag-and-drop new nodes from the palette
 *   - Connect edges between nodes
 *   - Background grid + controls + mini-map
 */

import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from '@xyflow/react';

import { nodeTypes } from './nodes.js';
import type { FlowNodeData, NodeKind } from './nodes.js';

// ── Props ─────────────────────────────────────────────────────────────────────

interface FlowCanvasProps {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node<FlowNodeData>>;
  onEdgesChange: OnEdgesChange;
  onEdgesUpdate: (edges: Edge[]) => void;
  onNodeSelect: (node: Node<FlowNodeData> | null) => void;
  onNodesUpdate: (nodes: Node<FlowNodeData>[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

let nodeCounter = 1;

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onEdgesUpdate,
  onNodeSelect,
  onNodesUpdate,
}: FlowCanvasProps) {
  const rfInstanceRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ── Connect handler ────────────────────────────────────────────────────────
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      onEdgesUpdate(addEdge({ ...connection, animated: true }, edges));
    },
    [edges, onEdgesUpdate]
  );

  // ── Drop handler — creates a new node from palette drag ───────────────────
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const kind = event.dataTransfer.getData('application/flow-node-kind') as NodeKind;
      if (!kind) return;

      const rfInstance = rfInstanceRef.current;
      if (!rfInstance || !reactFlowWrapper.current) return;

      const wrapperBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - wrapperBounds.left,
        y: event.clientY - wrapperBounds.top,
      });

      const id = `${kind}-${nodeCounter++}`;
      const newNode: Node<FlowNodeData> = {
        id,
        type: kind,
        position,
        data: {
          kind,
          label: defaultLabel(kind),
        },
      };

      onNodesUpdate([...nodes, newNode]);
    },
    [nodes, onNodesUpdate]
  );

  // ── Node click → select ───────────────────────────────────────────────────
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<FlowNodeData>) => {
      onNodeSelect(node);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={reactFlowWrapper}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--background)',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={(instance) => {
          rfInstanceRef.current = instance as ReactFlowInstance<Node<FlowNodeData>, Edge>;
        }}
        fitView
        deleteKeyCode="Backspace"
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--background)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--border)" />
        <Controls
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
          nodeColor={(n) => miniMapColor(n as Node<FlowNodeData>)}
          maskColor="rgba(0,0,0,0.4)"
        />
      </ReactFlow>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultLabel(kind: NodeKind): string {
  switch (kind) {
    case 'agent':
      return 'Agent';
    case 'tool':
      return 'Tool';
    case 'condition':
      return 'Router';
    case 'state':
      return 'State';
    case 'hitl':
      return 'Human';
  }
}

function miniMapColor(node: Node<FlowNodeData>): string {
  switch (node.data?.kind) {
    case 'agent':
      return '#3b82f6';
    case 'tool':
      return '#f97316';
    case 'condition':
      return '#eab308';
    case 'state':
      return '#14b8a6';
    case 'hitl':
      return '#a855f7';
    default:
      return '#6b7280';
  }
}
