# Flows — LangGraph State Graphs + Visual Builder

*Part of: AI Agent App Starter Kit*

Extract LangGraph graph primitives from libs/flows/ and build a visual flow builder using React Flow for designing agent workflows on a canvas.

**Status:** undefined

## Phases

### 1. Extract LangGraph graph primitives

Create packages/flows/ in the starter kit. Extract from libs/flows/src/graphs/: GraphBuilder class with OTel tracing, createLinearGraph/createLoopGraph/createBranchingGraph factories, state-utils (createStateAnnotation from Zod, validateState, mergeState), all routers (createBinaryRouter, createValueRouter, createSequentialRouter, createParallelRouter, etc.), all reducers (appendReducer, replaceReducer, counterReducer, etc.), state-transforms (createSubgraphBridge, createFieldMapper). Also extract xml-parser (extractTag, extractAllTags, etc.) as a zero-dep utility. Include example flows: basic-chat-agent.ts, tool-calling-agent.ts, hitl-approval-flow.ts.

**Complexity:** large

**Files:**
- libs/templates/starters/ai-agent-app/packages/flows/src/builder.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/routers.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/reducers.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/state-utils.ts
- libs/templates/starters/ai-agent-app/packages/flows/src/xml-parser.ts

**Acceptance Criteria:**
- [ ] GraphBuilder wraps StateGraph with OTel spans
- [ ] Factory functions create common graph patterns
- [ ] Zod-to-LangGraph state annotations work
- [ ] All routers and reducers function correctly
- [ ] XML parser extracts tags from LLM output
- [ ] Example flows compile and run

### 2. Build visual flow builder with React Flow

Create /flows route in packages/app with a visual canvas using @xyflow/react (React Flow v12). Define node types: AgentNode (LLM call), ToolNode (tool invocation), ConditionNode (branching router), StateNode (state transform), HITLNode (human approval gate). Users drag-and-drop nodes, connect edges, configure properties in a side panel. The canvas outputs a LangGraph state graph definition (JSON) that can be compiled to executable code. Include save/load to localStorage and export to TypeScript.

**Complexity:** large

**Files:**
- libs/templates/starters/ai-agent-app/packages/app/src/routes/flows.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/canvas.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/nodes.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/sidebar.tsx
- libs/templates/starters/ai-agent-app/packages/app/src/components/flow-builder/codegen.ts

**Acceptance Criteria:**
- [ ] React Flow canvas renders with custom node types
- [ ] Drag-and-drop node creation works
- [ ] Edge connections between nodes work
- [ ] Side panel configures node properties
- [ ] Export generates valid LangGraph TypeScript code
- [ ] Save/load to localStorage works
