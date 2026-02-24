# LangGraph Core Concepts

This document provides a deep dive into LangGraph's fundamental concepts, state management, and advanced features.

## Table of Contents

- [State Management](#state-management)
- [Annotations and Reducers](#annotations-and-reducers)
- [Nodes](#nodes)
- [Edges](#edges)
- [Checkpointing](#checkpointing)
- [Streaming](#streaming)
- [Type Safety](#type-safety)

## State Management

State is the core data structure that flows through your graph. In LangGraph, state is immutable - nodes return updates that are merged with existing state using reducer functions.

### State Flow

```
Initial State
    ↓
[Node A] → State Update A
    ↓ (merge via reducer)
Updated State
    ↓
[Node B] → State Update B
    ↓ (merge via reducer)
Final State
```

### State Immutability

Each node receives a snapshot of the current state and returns updates. The original state is never modified:

```typescript
function processNode(state: typeof GraphState.State) {
  // state is read-only snapshot
  console.log(state.counter); // Read current value

  // Return updates (partial state)
  return {
    counter: state.counter + 1,
    messages: ['Processed'],
  };
}
```

### State Visibility

Every node sees the cumulative state from all previous nodes:

```typescript
const State = Annotation.Root({
  step1Result: Annotation<string>(),
  step2Result: Annotation<string>(),
  step3Result: Annotation<string>(),
});

workflow.addNode('step1', (state) => ({ step1Result: 'A' }));
workflow.addNode('step2', (state) => {
  // Sees step1Result
  return { step2Result: state.step1Result + 'B' };
});
workflow.addNode('step3', (state) => {
  // Sees both step1Result and step2Result
  return { step3Result: state.step2Result + 'C' };
});
```

## Annotations and Reducers

Annotations define your state schema and how updates are merged.

### Basic Annotation Syntax

```typescript
import { Annotation } from '@langchain/langgraph';

const State = Annotation.Root({
  fieldName: Annotation<Type>({
    reducer: (current: Type, update: Type) => Type,
    default: () => Type,
  }),
});
```

### Common Reducer Patterns

#### 1. Replace Reducer

New value completely replaces old value. Use for single values.

```typescript
const State = Annotation.Root({
  counter: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  status: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => 'pending',
  }),
});
```

#### 2. Append Reducer

New values are added to existing collection. Use for accumulating data.

```typescript
const State = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  events: Annotation<Event[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});
```

#### 3. Merge Reducer

Objects are merged together. Use for dictionaries/maps.

```typescript
const State = Annotation.Root({
  metadata: Annotation<Record<string, any>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  config: Annotation<Config>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({ enabled: false }),
  }),
});
```

#### 4. Custom Reducer

Implement custom logic for complex scenarios.

```typescript
const State = Annotation.Root({
  // Keep last N messages
  recentMessages: Annotation<string[]>({
    reducer: (current, update) => {
      const combined = [...current, ...update];
      return combined.slice(-10); // Keep last 10
    },
    default: () => [],
  }),

  // Track min/max
  stats: Annotation<{ min: number; max: number }>({
    reducer: (current, update) => ({
      min: Math.min(current.min, update.min),
      max: Math.max(current.max, update.max),
    }),
    default: () => ({ min: Infinity, max: -Infinity }),
  }),
});
```

### Default Values

Always provide default values for your state fields:

```typescript
const State = Annotation.Root({
  // ✅ Good: Provides default
  messages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ❌ Bad: No default (will be undefined)
  messages: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
  }),
});
```

## Nodes

Nodes are functions that process state and return updates.

### Node Function Signature

```typescript
type NodeFunction = (state: StateType) => Partial<StateType> | Promise<Partial<StateType>>;
```

### Synchronous Nodes

```typescript
function syncNode(state: typeof GraphState.State) {
  const result = processData(state.input);

  return {
    output: result,
    processed: true,
  };
}

workflow.addNode('sync', syncNode);
```

### Asynchronous Nodes

```typescript
async function asyncNode(state: typeof GraphState.State) {
  const result = await fetchData(state.input);

  return {
    data: result,
    fetched: true,
  };
}

workflow.addNode('async', asyncNode);
```

### Node Best Practices

#### 1. Single Responsibility

Each node should do one thing well:

```typescript
// ✅ Good: Focused responsibilities
workflow.addNode('fetch', async (state) => {
  const data = await fetch(state.url);
  return { data };
});

workflow.addNode('validate', (state) => {
  const isValid = validate(state.data);
  return { isValid };
});

workflow.addNode('process', (state) => {
  const result = process(state.data);
  return { result };
});

// ❌ Bad: Doing too much
workflow.addNode('fetchValidateProcess', async (state) => {
  const data = await fetch(state.url);
  const isValid = validate(data);
  const result = process(data);
  return { data, isValid, result };
});
```

#### 2. Return Only Updates

Don't return the entire state, only the fields you're updating:

```typescript
// ✅ Good: Returns only updates
function goodNode(state: typeof State.State) {
  return {
    counter: state.counter + 1,
  };
}

// ❌ Bad: Returns entire state
function badNode(state: typeof State.State) {
  return {
    ...state,
    counter: state.counter + 1,
  };
}
```

#### 3. Error Handling

Handle errors gracefully and store them in state:

```typescript
const State = Annotation.Root({
  result: Annotation<string>({ ... }),
  error: Annotation<string | null>({ ... }),
});

async function safeNode(state: typeof State.State) {
  try {
    const result = await riskyOperation(state.input);
    return { result, error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

#### 4. Logging

Log progress for debugging and monitoring:

```typescript
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('my-graph');

function loggingNode(state: typeof State.State) {
  logger.info('Processing node', {
    input: state.input,
    step: state.step,
  });

  const result = processData(state.input);

  logger.info('Node complete', { result });

  return { result };
}
```

## Edges

Edges define the flow between nodes.

### Static Edges

Connect nodes in a fixed sequence:

```typescript
// Single connection
workflow.addEdge('node_a', 'node_b');

// Chain multiple nodes
workflow.addEdge('start', 'middle');
workflow.addEdge('middle', 'end');

// End the graph
workflow.addEdge('final', '__end__');
```

### Conditional Edges

Route dynamically based on state:

```typescript
// Define router function
function router(state: typeof State.State): string {
  if (state.approved) {
    return 'execute';
  } else if (state.needsReview) {
    return 'review';
  } else {
    return 'reject';
  }
}

// Add conditional edge
workflow.addConditionalEdges(
  'decision', // Source node
  router, // Router function
  {
    // Mapping of return values to target nodes
    execute: 'execute_node',
    review: 'review_node',
    reject: 'reject_node',
  }
);
```

### Entry and Finish Points

Every graph needs an entry point and finish point:

```typescript
// Set where the graph starts
workflow.setEntryPoint('start');

// Set where the graph ends
workflow.setFinishPoint('end');

// Or use special __end__ marker
workflow.addEdge('final_node', '__end__');
```

### Cyclic Graphs

Graphs can have cycles, but always ensure exit conditions:

```typescript
function retryRouter(state: typeof State.State): string {
  if (state.success) {
    return '__end__';
  } else if (state.retries < 3) {
    return 'retry';
  } else {
    return 'failed';
  }
}

workflow.addConditionalEdges('check', retryRouter, {
  retry: 'process', // Cycle back
  failed: 'handle_failure',
  __end__: '__end__',
});
```

## Checkpointing

Checkpointing persists state at specific points, enabling:

- Resuming interrupted workflows
- Time-travel debugging
- Human-in-the-loop patterns

### Using Memory Saver

```typescript
import { MemorySaver } from '@langchain/langgraph';

const checkpointer = new MemorySaver();

const app = workflow.compile({
  checkpointer,
});

// Use thread_id to identify separate runs
const config = { configurable: { thread_id: 'session-123' } };

const result = await app.invoke(initialState, config);
```

### Interrupt Points

Pause execution at specific nodes:

```typescript
const app = workflow.compile({
  checkpointer,
  interruptBefore: ['human_review'], // Pause before this node
  // Or: interruptAfter: ['analysis'] // Pause after this node
});

// First invocation - runs until interrupt
let state = await app.invoke(initialState, config);

// Human makes decision
const approval = await getHumanInput();

// Resume with updated state
state = await app.invoke({ ...state, approved: approval }, config);
```

### Persistence

For production use, implement a persistent checkpointer:

```typescript
import { BaseCheckpointSaver } from '@langchain/langgraph';

class DatabaseCheckpointer extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig) {
    // Load from database
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint) {
    // Save to database
  }

  async list(config: RunnableConfig, limit?: number) {
    // List checkpoints
  }
}
```

## Streaming

Stream node outputs as they complete:

```typescript
const stream = await app.stream(initialState, config);

for await (const output of stream) {
  console.log('Node output:', output);
}
```

Stream with updates mode:

```typescript
const stream = await app.stream(initialState, {
  ...config,
  streamMode: 'updates', // or 'values'
});

for await (const [nodeName, output] of stream) {
  console.log(`${nodeName}:`, output);
}
```

## Type Safety

LangGraph is fully typed. Leverage TypeScript for safety:

```typescript
// Define state type
const State = Annotation.Root({
  count: Annotation<number>({ ... }),
  items: Annotation<string[]>({ ... }),
});

// Extract state type
type StateType = typeof State.State;

// Typed node function
function typedNode(state: StateType): Partial<StateType> {
  return {
    count: state.count + 1,
    items: [...state.items, 'new'],
  };
}

// TypeScript catches errors
function badNode(state: StateType): Partial<StateType> {
  return {
    count: 'invalid', // ❌ Type error!
    unknown: true, // ❌ Type error!
  };
}
```

## Next Steps

- See [patterns.md](./patterns.md) for common graph patterns
- See [debugging.md](./debugging.md) for debugging techniques
- Run the examples to see concepts in action

## References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [State Management Guide](https://langchain-ai.github.io/langgraphjs/concepts/low_level/#state)
- [Checkpointing Guide](https://langchain-ai.github.io/langgraphjs/concepts/persistence/)
