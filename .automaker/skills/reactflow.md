---
name: reactflow
emoji: 🔀
description: React Flow (@xyflow/react) expert for building node-based UIs. Use when implementing flow diagrams, custom nodes/edges, or interactive graph layouts. Trigger on "React Flow", "node graph", "flow diagram", "custom node", "edge routing", or "xyflow".
metadata:
  author: agent
  created: 2026-02-18T00:43:04.059Z
  usageCount: 0
  successRate: 0
  tags: [react-flow, xyflow, graph, nodes, edges, visualization, frontend, matt]
  source: learned
---

# React Flow Expert Skill

You are a React Flow (@xyflow/react) specialist. Use this knowledge when building or modifying node-based graph UIs.

## Package

```bash
npm install @xyflow/react
```

Import: `import { ReactFlow, Handle, Position, ... } from '@xyflow/react';`

## Docs Reference

- **Learn**: https://reactflow.dev/learn
- **API Reference**: https://reactflow.dev/api-reference
- **Examples**: https://reactflow.dev/examples
- **Custom Nodes**: https://reactflow.dev/learn/customization/custom-nodes
- **Custom Edges**: https://reactflow.dev/learn/customization/custom-edges
- **Computing Flows**: https://reactflow.dev/learn/advanced-use/computing-flows
- **SSR/SSG**: https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration
- **Theming**: https://reactflow.dev/learn/customization/theming
- **Handles**: https://reactflow.dev/learn/customization/handles
- **Performance**: https://reactflow.dev/learn/advanced-use/performance
- **State Management**: https://reactflow.dev/learn/advanced-use/state-management
- **TypeScript**: https://reactflow.dev/learn/advanced-use/typescript
- **Sub Flows**: https://reactflow.dev/learn/layouting/sub-flows
- **Layouting**: https://reactflow.dev/learn/layouting
- **Accessibility**: https://reactflow.dev/learn/advanced-use/accessibility

Use Context7 (`resolve-library-id` → `query-docs`) to look up specific API details when implementing.

## Core Architecture

### ReactFlow Component

```tsx
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// CRITICAL: Define nodeTypes OUTSIDE component to prevent re-renders
const nodeTypes = { custom: CustomNode };
const edgeTypes = { animated: AnimatedEdge };

function FlowGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
```

### Key Props (ReactFlow)

| Prop                  | Type                            | Default     | Description            |
| --------------------- | ------------------------------- | ----------- | ---------------------- |
| `nodes`               | `Node[]`                        | `[]`        | Node array             |
| `edges`               | `Edge[]`                        | `[]`        | Edge array             |
| `nodeTypes`           | `Record<string, ComponentType>` | built-ins   | Custom node components |
| `edgeTypes`           | `Record<string, ComponentType>` | built-ins   | Custom edge components |
| `fitView`             | `boolean`                       | `false`     | Auto-fit on load       |
| `minZoom` / `maxZoom` | `number`                        | `0.5` / `2` | Zoom limits            |
| `defaultViewport`     | `{x, y, zoom}`                  | `{0, 0, 1}` | Initial viewport       |
| `snapToGrid`          | `boolean`                       | `false`     | Snap dragging          |
| `snapGrid`            | `[number, number]`              | `[15, 15]`  | Grid spacing           |
| `connectionMode`      | `'strict' \| 'loose'`           | `'strict'`  | Connection validation  |
| `nodeOrigin`          | `[number, number]`              | `[0, 0]`    | Node anchor point      |

### Event Handlers

```tsx
onNodeClick={(event, node) => {}}
onNodeDoubleClick={(event, node) => {}}
onNodeDrag={(event, node, nodes) => {}}
onNodeDragStop={(event, node, nodes) => {}}
onEdgeClick={(event, edge) => {}}
onConnect={(connection) => {}}
onInit={(reactFlowInstance) => {}}
onPaneClick={(event) => {}}
onNodesChange={(changes) => {}}
onEdgesChange={(changes) => {}}
onBeforeDelete={({nodes, edges}) => boolean | Promise<boolean>}
```

## Custom Nodes

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';

// Define the node data type
type IdeaNodeData = {
  label: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  progress?: number;
};

// Type-safe custom node
function IdeaNode({ data, selected }: NodeProps<Node<IdeaNodeData>>) {
  return (
    <div className={cn('rounded-lg border p-3', selected && 'ring-2 ring-primary')}>
      <Handle type="target" position={Position.Left} />
      <div className="text-sm font-medium">{data.label}</div>
      {data.status === 'processing' && (
        <div className="mt-1 h-1 bg-primary/20 rounded">
          <div className="h-full bg-primary rounded" style={{ width: `${data.progress}%` }} />
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// MUST be defined outside component
const nodeTypes = { idea: IdeaNode };
```

### Handle Props

```tsx
<Handle
  type="source" | "target"
  position={Position.Top | Position.Bottom | Position.Left | Position.Right}
  id="unique-handle-id"  // Required for multiple handles
  isConnectable={true}
  style={{ background: '#555' }}
/>
```

### Preventing Drag on Interactive Elements

Add `className="nodrag"` to inputs, buttons, selects inside nodes:

```tsx
<input className="nodrag" onChange={handleChange} />
<button className="nodrag nopan" onClick={handleClick}>Edit</button>
```

## Custom Edges

```tsx
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, ...props }: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      {/* Animated dot along the path */}
      <circle r="4" fill="var(--color-primary)">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
}

const edgeTypes = { animated: AnimatedEdge };
```

### Path Generators

- `getBezierPath()` — Smooth curves (default)
- `getSmoothStepPath()` — Stepped with rounded corners
- `getStraightPath()` — Direct lines
- `getSimpleBezierPath()` — Simple curves

All return `[path, labelX, labelY, offsetX, offsetY]`.

## Computing Flows (Data Processing)

For flows where nodes process/transform data:

```tsx
import { useReactFlow, useNodeConnections, useNodesData } from '@xyflow/react';

function ProcessorNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const connections = useNodeConnections({ type: 'target' });
  const sourceData = useNodesData(connections.map((c) => c.source));

  useEffect(() => {
    // Process input data and update this node's output
    const result = processData(sourceData);
    updateNodeData(id, { output: result });
  }, [sourceData]);

  return <div>{data.output}</div>;
}
```

**Key rule**: Don't use `data` as direct UI state for inputs. Keep separate local state to avoid cursor jumping.

## Hooks Reference

| Hook                     | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `useReactFlow()`         | Access instance methods (fitView, getNodes, updateNodeData, etc.) |
| `useNodesState()`        | Managed nodes state with change handler                           |
| `useEdgesState()`        | Managed edges state with change handler                           |
| `useNodeConnections()`   | Get connections for a node's handles                              |
| `useNodesData()`         | Get data from specific nodes by ID                                |
| `useOnSelectionChange()` | Track selection changes                                           |
| `useStore()`             | Access internal Zustand store                                     |
| `useKeyPress()`          | Keyboard shortcut detection                                       |
| `useViewport()`          | Current viewport {x, y, zoom}                                     |

## Layout Patterns

React Flow doesn't include auto-layout. Use external libraries:

### Dagre (hierarchical)

```tsx
import dagre from 'dagre-d3';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
dagreGraph.setGraph({ rankdir: 'LR' }); // Left-to-right

nodes.forEach((node) => dagreGraph.setNode(node.id, { width: 200, height: 80 }));
edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
dagre.layout(dagreGraph);
```

### ELK (advanced)

```tsx
import ELK from 'elkjs';
const elk = new ELK();
const layout = await elk.layout(graph);
```

## Theming with Tailwind CSS

React Flow exposes CSS variables for theming:

```css
.react-flow {
  --xy-background-color: var(--color-background);
  --xy-node-color: var(--color-foreground);
  --xy-node-border: var(--color-border);
  --xy-edge-stroke: var(--color-muted-foreground);
  --xy-minimap-background: var(--color-card);
  --xy-controls-button-background: var(--color-card);
}
```

**Automaker pattern**: Use semantic tokens from our design system, not raw values. Wrap in `getCopilotKitThemeStyles()`-like bridge function.

## Performance Tips

1. **Memoize custom nodes**: Use `React.memo()` on node components
2. **nodeTypes outside component**: NEVER define inside render function
3. **useCallback for handlers**: Prevent unnecessary re-renders
4. **Virtualization**: React Flow auto-virtualizes nodes outside viewport
5. **Batch updates**: Use `setNodes`/`setEdges` not individual updates

## SSR/SSG Support

For server-rendered flows, nodes need explicit dimensions:

```tsx
const nodes = [
  {
    id: '1',
    position: { x: 0, y: 0 },
    data: { label: 'Node' },
    width: 200, // Required for SSR
    height: 80, // Required for SSR
    handles: [
      // Required for edge rendering
      { type: 'target', position: Position.Left, x: 0, y: 40 },
      { type: 'source', position: Position.Right, x: 200, y: 40 },
    ],
  },
];
```

## Automaker-Specific Patterns

### Existing Flow Graph

Located at `apps/ui/src/components/views/flow-graph/`. Uses:

- Custom node types for system components (crew, agents, services)
- Dagre layout for hierarchical positioning
- Dialog system for node details
- Real-time data from React Query hooks
- Tailwind CSS theming via semantic tokens

### File Structure Convention

```
components/views/{view-name}/
  {view-name}.tsx          # Main view
  types.ts                 # Node/edge data types
  constants.ts             # Static config
  hooks/
    use-{view}-data.ts     # Data fetching/transformation
  nodes/
    {node-type}-node.tsx   # Custom node components
  edges/
    {edge-type}-edge.tsx   # Custom edge components
  dialogs/
    node-detail-dialog.tsx # Click-to-inspect dialogs
```

### Integration with Design System

- Use `cn()` for className composition
- Use CVA variants for node status styling
- Use Radix Dialog for node detail panels
- Use semantic color tokens (`bg-card`, `text-foreground`, `border-border`)
- Respect all 41 themes via token system
