# Phase 2: Build visual flow builder with React Flow

_AI Agent App Starter Kit > Flows — LangGraph State Graphs + Visual Builder_

Create /flows route in packages/app with a visual canvas using @xyflow/react (React Flow v12). Define node types: AgentNode (LLM call), ToolNode (tool invocation), ConditionNode (branching router), StateNode (state transform), HITLNode (human approval gate). Users drag-and-drop nodes, connect edges, configure properties in a side panel. The canvas outputs a LangGraph state graph definition (JSON) that can be compiled to executable code. Include save/load to localStorage and export to TypeScript.

**Complexity:** large

## Files to Modify

- libs/templates/starters/ai-agent-app/packages/app/src/routes/flows.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/canvas.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/nodes.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/sidebar.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/codegen.ts

## Acceptance Criteria

- [ ] React Flow canvas renders with custom node types
- [ ] Drag-and-drop node creation works
- [ ] Edge connections between nodes work
- [ ] Side panel configures node properties
- [ ] Export generates valid LangGraph TypeScript code
- [ ] Save/load to localStorage works
