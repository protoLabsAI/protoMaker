# @protolabs-ai/flows

LangGraph state graph examples and patterns for building AI workflows in AutoMaker.

## Overview

This package provides comprehensive examples and documentation for working with LangGraph StateGraphs. LangGraph is a framework for building stateful, multi-actor applications with LLMs, using a graph-based approach to orchestrate complex workflows.

## Quick Start

```bash
# Install dependencies
npm install

# Run examples
npm run example:basic      # Basic state graph fundamentals
npm run example:hitl       # Human-in-the-loop pattern
npm run example:subgraph   # Composable subgraph pattern
```

## Core Concepts

### StateGraph

A `StateGraph` is the fundamental building block in LangGraph. It defines:

1. **State Schema** - The data structure that flows through the graph
2. **Nodes** - Functions that process and update state
3. **Edges** - Connections that define the flow between nodes

```typescript
import { Annotation, StateGraph } from '@langchain/langgraph';

// 1. Define state with annotations
const GraphState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

// 2. Create the graph
const workflow = new StateGraph(GraphState);

// 3. Add nodes
workflow.addNode('process', (state) => {
  return { messages: ['Processed!'] };
});

// 4. Define edges
workflow.setEntryPoint('process');
workflow.setFinishPoint('process');

// 5. Compile and run
const app = workflow.compile();
const result = await app.invoke({ messages: ['Start'] });
```

### State Annotations

State annotations define how state updates are merged using reducer functions:

```typescript
const State = Annotation.Root({
  // Replace: New value completely replaces old value
  counter: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),

  // Append: New values are added to existing array
  messages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Merge: Objects are merged
  metadata: Annotation<Record<string, any>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
});
```

### Nodes

Nodes are functions that receive the current state and return updates:

```typescript
function myNode(state: typeof GraphState.State) {
  // Process state
  const result = doSomeWork(state.messages);

  // Return updates (not the full state)
  return {
    messages: [result],
    counter: state.counter + 1,
  };
}

workflow.addNode('my_node', myNode);
```

### Edges

Edges connect nodes and define the execution flow:

```typescript
// Static edge: Always goes to next node
workflow.addEdge('node_a', 'node_b');

// Conditional edge: Route based on state
workflow.addConditionalEdges('router', (state) => (state.approved ? 'execute' : 'reject'), {
  execute: 'execute_node',
  reject: 'reject_node',
});

// Entry and exit points
workflow.setEntryPoint('start');
workflow.setFinishPoint('end');
// Or use special __end__ node
workflow.addEdge('final_node', '__end__');
```

## Examples

### Basic Graph (`example:basic`)

Demonstrates fundamental LangGraph concepts:

- State annotations and reducers
- Node functions
- Linear edge flow
- Entry/exit points

**Key learning**: Understanding how state flows through nodes and how reducers merge updates.

### Human-in-the-Loop (`example:hitl`)

Shows how to pause execution for human approval:

- Conditional routing
- Interrupt points
- Checkpointers for state persistence
- Resuming execution

**Key learning**: Building workflows that require human decision points.

### Subgraph Pattern (`example:subgraph`)

Demonstrates composable, modular workflows:

- Creating reusable subgraphs
- Nesting graphs within graphs
- State mapping between parent/child
- Separation of concerns

**Key learning**: Building complex workflows from smaller, focused components.

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[concepts.md](./docs/concepts.md)** - Deep dive into LangGraph concepts, state management, and checkpointing
- **[patterns.md](./docs/patterns.md)** - Common graph patterns and best practices
- **[debugging.md](./docs/debugging.md)** - Debugging techniques and troubleshooting

## Graph Patterns

### Linear Flow

```
entry → process → validate → exit
```

Simple sequential execution. Good for straightforward workflows.

### Conditional Routing

```
entry → analyze → [decision] → branch_a
                            ↘ branch_b
```

Dynamic routing based on state. Essential for decision-making workflows.

### Human-in-the-Loop

```
entry → analyze → [needs review?] → human_review → execute
                ↘ [auto-approve] ↗
```

Pause for human input. Critical for high-risk operations.

### Subgraph Composition

```
parent_node → [subgraph: validate] → [subgraph: process] → parent_node
```

Modular, reusable components. Best practice for complex workflows.

### Cyclic Graphs

```
entry → process → validate → [valid?] → exit
                    ↑         ↓ [retry]
                    └─────────┘
```

Loops for retry logic. Use with caution - always have exit conditions.

## Best Practices

### 1. State Design

- Keep state minimal - only what's needed
- Use descriptive field names
- Choose appropriate reducers
- Set sensible defaults

### 2. Node Functions

- Single responsibility - one task per node
- Return only updates, not full state
- Keep nodes pure when possible
- Log progress for debugging

### 3. Edge Design

- Use conditional edges for decisions
- Validate routing logic
- Always have exit conditions for cycles
- Document complex routing

### 4. Error Handling

- Catch errors in nodes
- Store errors in state
- Route to error handlers
- Log failures with context

### 5. Testing

- Test nodes in isolation
- Verify routing logic
- Test error paths
- Use mocks for external dependencies

## Common Pitfalls

### 1. State Mutation

**❌ Don't mutate state directly:**

```typescript
function badNode(state: typeof State.State) {
  state.messages.push('new'); // Mutates state!
  return state;
}
```

**✅ Return new objects:**

```typescript
function goodNode(state: typeof State.State) {
  return {
    messages: [...state.messages, 'new'],
  };
}
```

### 2. Missing Reducers

**❌ Wrong reducer type:**

```typescript
counter: Annotation<number>({
  // This appends numbers to array instead of replacing!
  reducer: (current, update) => [...current, update],
});
```

**✅ Use appropriate reducer:**

```typescript
counter: Annotation<number>({
  reducer: (_current, update) => update, // Replace
});
```

### 3. Infinite Loops

**❌ No exit condition:**

```typescript
workflow.addConditionalEdges(
  'check',
  (state) => (state.count < 10 ? 'process' : 'process') // Always loops!
);
```

**✅ Proper exit:**

```typescript
workflow.addConditionalEdges('check', (state) => (state.count < 10 ? 'process' : '__end__'));
```

## Integration with AutoMaker

These patterns are designed for use in AutoMaker's agent workflows:

- **Basic graphs** for simple feature implementations
- **HITL** for authority approval flows
- **Subgraphs** for complex multi-stage features

## Dependencies

- `@langchain/langgraph` - Core LangGraph framework
- `@langchain/core` - LangChain base classes
- `@langchain/anthropic` - Claude model integration
- `@protolabs-ai/utils` - Logging and utilities
- `@protolabs-ai/types` - TypeScript type definitions

## Development

```bash
# Build the package
npm run build

# Run tests
npm run test

# Watch mode
npm run watch
```

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [LangGraph Tutorials](https://langchain-ai.github.io/langgraphjs/tutorials/)
- [AutoMaker Documentation](../../docs/)

## License

SEE LICENSE IN LICENSE
