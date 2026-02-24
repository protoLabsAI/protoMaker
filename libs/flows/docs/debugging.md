# LangGraph Debugging Guide

This document covers debugging techniques, common issues, and troubleshooting strategies for LangGraph workflows.

## Table of Contents

- [Debugging Techniques](#debugging-techniques)
- [Common Issues](#common-issues)
- [Troubleshooting Checklist](#troubleshooting-checklist)
- [Performance Optimization](#performance-optimization)
- [Testing Strategies](#testing-strategies)

## Debugging Techniques

### 1. State Logging

Log state at each node to track data flow:

```typescript
function debugNode(state: typeof State.State) {
  console.log('Current state:', JSON.stringify(state, null, 2));

  const result = processData(state.input);

  console.log('Node output:', { result });

  return { result };
}
```

Use a proper logger for production:

```typescript
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('my-graph');

function node(state: typeof State.State) {
  logger.debug('Node input', { state });

  const result = processData(state.input);

  logger.debug('Node output', { result });

  return { result };
}
```

---

### 2. Step-by-Step Execution

Use streaming to observe each node execution:

```typescript
const stream = await app.stream(initialState, {
  streamMode: 'updates',
});

for await (const [nodeName, output] of stream) {
  console.log(`\n=== ${nodeName} ===`);
  console.log(JSON.stringify(output, null, 2));
}
```

---

### 3. Checkpoint Inspection

Use checkpointers to inspect state at any point:

```typescript
import { MemorySaver } from '@langchain/langgraph';

const checkpointer = new MemorySaver();

const app = workflow.compile({
  checkpointer,
  interruptAfter: ['node1', 'node2'], // Pause after each node
});

const config = { configurable: { thread_id: 'debug-session' } };

// Execute node by node
let state = await app.invoke(input, config);
console.log('After node1:', state);

state = await app.invoke(state, config);
console.log('After node2:', state);
```

---

### 4. Visual Debugging

Print graph structure:

```typescript
const app = workflow.compile();

// Get graph structure
const graph = app.getGraph();

console.log('Nodes:', graph.nodes);
console.log('Edges:', graph.edges);
```

Generate a diagram:

```typescript
// Pseudo-code: Generate mermaid diagram
function generateDiagram(graph: any) {
  let mermaid = 'graph TD\n';

  for (const [source, target] of graph.edges) {
    mermaid += `  ${source} --> ${target}\n`;
  }

  return mermaid;
}
```

---

### 5. Error Boundaries

Wrap risky operations and capture errors in state:

```typescript
const State = Annotation.Root({
  errors: Annotation<Array<{ node: string; error: string }>>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

function safeNode(state: typeof State.State) {
  try {
    const result = riskyOperation(state.input);
    return { result };
  } catch (error) {
    logger.error('Node failed', { error });

    return {
      errors: [
        {
          node: 'safeNode',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    };
  }
}
```

---

### 6. Conditional Breakpoints

Add debug nodes that only execute in debug mode:

```typescript
const DEBUG = process.env.DEBUG === 'true';

if (DEBUG) {
  workflow.addNode('debug_checkpoint', (state) => {
    console.log('DEBUG CHECKPOINT:', state);
    debugger; // Will pause if running with debugger
    return {};
  });

  workflow.addEdge('node1', 'debug_checkpoint');
  workflow.addEdge('debug_checkpoint', 'node2');
} else {
  workflow.addEdge('node1', 'node2');
}
```

---

## Common Issues

### Issue 1: State Not Updating

**Symptom:** Node returns updates but state doesn't change.

**Causes:**

1. **Wrong reducer function:**

```typescript
// ❌ Problem: Using append reducer for single value
counter: Annotation<number>({
  reducer: (current, update) => [...current, update], // Tries to spread number!
  default: () => 0,
});

// ✅ Fix: Use replace reducer
counter: Annotation<number>({
  reducer: (_current, update) => update,
  default: () => 0,
});
```

2. **Mutating state instead of returning new values:**

```typescript
// ❌ Problem: Mutating state
function badNode(state: typeof State.State) {
  state.items.push('new'); // Mutates!
  return state;
}

// ✅ Fix: Return new array
function goodNode(state: typeof State.State) {
  return { items: [...state.items, 'new'] };
}
```

3. **Not returning anything:**

```typescript
// ❌ Problem: No return value
function badNode(state: typeof State.State) {
  processData(state.input);
  // Missing return!
}

// ✅ Fix: Return updates
function goodNode(state: typeof State.State) {
  const result = processData(state.input);
  return { result };
}
```

**Debug:**

```typescript
function debugNode(state: typeof State.State) {
  const updates = { counter: state.counter + 1 };

  console.log('Current state:', state);
  console.log('Returning updates:', updates);

  return updates;
}
```

---

### Issue 2: Infinite Loop

**Symptom:** Graph never completes, runs forever.

**Causes:**

1. **Missing exit condition:**

```typescript
// ❌ Problem: Always loops back
workflow.addConditionalEdges('check', (state) => 'process');

// ✅ Fix: Add exit condition
workflow.addConditionalEdges('check', (state) => (state.done ? '__end__' : 'process'));
```

2. **Incorrect cycle detection:**

```typescript
// ❌ Problem: Counter never reaches limit
function badRouter(state: typeof State.State): string {
  if (state.counter < 10) return 'process';
  return 'process'; // Should be __end__!
}

// ✅ Fix: Proper exit
function goodRouter(state: typeof State.State): string {
  if (state.counter < 10) return 'process';
  return '__end__';
}
```

**Debug:**

```typescript
function debugRouter(state: typeof State.State): string {
  const decision = state.counter < 10 ? 'process' : '__end__';

  console.log('Router decision:', {
    counter: state.counter,
    decision,
  });

  return decision;
}
```

**Prevention:**

```typescript
// Add max iterations safety check
const State = Annotation.Root({
  iterations: Annotation<number>({
    reducer: (_, u) => u,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_, u) => u,
    default: () => 100,
  }),
});

function safeRouter(state: typeof State.State): string {
  if (state.iterations >= state.maxIterations) {
    logger.warn('Max iterations reached');
    return '__end__';
  }

  return state.done ? '__end__' : 'process';
}

function incrementNode(state: typeof State.State) {
  return {
    iterations: state.iterations + 1,
    // ... other updates
  };
}
```

---

### Issue 3: Type Errors

**Symptom:** TypeScript compilation errors.

**Causes:**

1. **Incorrect state type in node:**

```typescript
// ❌ Problem: Wrong type
function badNode(state: any) {
  // Loses type safety
  return { result: state.input.toUpperCase() };
}

// ✅ Fix: Use proper type
function goodNode(state: typeof State.State) {
  return { result: state.input.toUpperCase() };
}
```

2. **Returning wrong fields:**

```typescript
// ❌ Problem: Field not in state
function badNode(state: typeof State.State) {
  return { unknownField: 'value' }; // Type error!
}

// ✅ Fix: Return valid fields
function goodNode(state: typeof State.State) {
  return { result: 'value' };
}
```

3. **Wrong annotation type:**

```typescript
// ❌ Problem: Type mismatch
const State = Annotation.Root({
  count: Annotation<number>(),
});

function badNode(state: typeof State.State) {
  return { count: 'not a number' }; // Type error!
}

// ✅ Fix: Match types
function goodNode(state: typeof State.State) {
  return { count: 42 };
}
```

---

### Issue 4: Routing Failures

**Symptom:** Conditional edges don't route to expected nodes.

**Causes:**

1. **Typo in node name:**

```typescript
workflow.addNode('execute_task', executeTask);

// ❌ Problem: Wrong name
workflow.addConditionalEdges('router', (state) => 'excute_task', {
  excute_task: 'execute_task', // Typo!
});

// ✅ Fix: Correct spelling
workflow.addConditionalEdges('router', (state) => 'execute_task', {
  execute_task: 'execute_task',
});
```

2. **Missing route mapping:**

```typescript
// ❌ Problem: Router returns value not in mapping
function router(state: typeof State.State): string {
  return state.type; // Could return 'type_c'
}

workflow.addConditionalEdges('router', router, {
  type_a: 'node_a',
  type_b: 'node_b',
  // Missing type_c!
});

// ✅ Fix: Handle all cases
workflow.addConditionalEdges('router', router, {
  type_a: 'node_a',
  type_b: 'node_b',
  type_c: 'node_c',
});
```

**Debug:**

```typescript
function debugRouter(state: typeof State.State): string {
  const route = determineRoute(state);

  console.log('Routing decision:', {
    state,
    route,
    available: ['route_a', 'route_b', 'route_c'],
  });

  return route;
}
```

---

### Issue 5: Async/Await Problems

**Symptom:** Async operations don't complete or state is wrong.

**Causes:**

1. **Not awaiting promises:**

```typescript
// ❌ Problem: Not awaiting
async function badNode(state: typeof State.State) {
  const promise = fetchData(state.url);
  return { data: promise }; // Returns Promise, not data!
}

// ✅ Fix: Await the promise
async function goodNode(state: typeof State.State) {
  const data = await fetchData(state.url);
  return { data };
}
```

2. **Parallel promises not handled:**

```typescript
// ❌ Problem: Sequential when should be parallel
async function slowNode(state: typeof State.State) {
  const data1 = await fetch1(); // Waits
  const data2 = await fetch2(); // Then waits
  return { data1, data2 };
}

// ✅ Fix: Use Promise.all
async function fastNode(state: typeof State.State) {
  const [data1, data2] = await Promise.all([fetch1(), fetch2()]);
  return { data1, data2 };
}
```

---

### Issue 6: Checkpoint Not Working

**Symptom:** State not persisted or interrupts not working.

**Causes:**

1. **Missing checkpointer:**

```typescript
// ❌ Problem: No checkpointer
const app = workflow.compile({
  interruptBefore: ['review'], // Won't work!
});

// ✅ Fix: Add checkpointer
import { MemorySaver } from '@langchain/langgraph';

const app = workflow.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ['review'],
});
```

2. **Missing config:**

```typescript
// ❌ Problem: No thread_id
await app.invoke(input);

// ✅ Fix: Provide config
await app.invoke(input, {
  configurable: { thread_id: 'session-1' },
});
```

---

## Troubleshooting Checklist

When debugging graph issues, check:

- [ ] **State schema**: All fields have correct types and reducers
- [ ] **Node returns**: Every node returns partial state or {}
- [ ] **No mutations**: No direct state modifications
- [ ] **Routing**: All router return values are in edge mappings
- [ ] **Exit conditions**: Cycles have break conditions
- [ ] **Async/await**: All promises are awaited
- [ ] **Error handling**: Try-catch around risky operations
- [ ] **Checkpointer**: Required for interrupts and persistence
- [ ] **Config**: thread_id provided when using checkpointer
- [ ] **Logging**: Sufficient logs to trace execution

---

## Performance Optimization

### 1. Minimize State Size

```typescript
// ❌ Bad: Large unnecessary data in state
const State = Annotation.Root({
  fullDataset: Annotation<any[]>(), // Could be huge!
  processedDataset: Annotation<any[]>(),
});

// ✅ Good: Keep only necessary data
const State = Annotation.Root({
  datasetId: Annotation<string>(), // Reference, not full data
  summary: Annotation<{ count: number; total: number }>(),
});
```

---

### 2. Optimize Reducers

```typescript
// ❌ Bad: Expensive reducer
messages: Annotation<string[]>({
  reducer: (current, update) => {
    // O(n) every update
    return [...new Set([...current, ...update])];
  },
});

// ✅ Good: Simple append
messages: Annotation<string[]>({
  reducer: (current, update) => [...current, ...update],
});
```

---

### 3. Use Parallel Operations

```typescript
// ❌ Bad: Sequential
async function slowNode(state: typeof State.State) {
  const a = await fetchA();
  const b = await fetchB();
  const c = await fetchC();
  return { a, b, c };
}

// ✅ Good: Parallel
async function fastNode(state: typeof State.State) {
  const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);
  return { a, b, c };
}
```

---

### 4. Cache Expensive Operations

```typescript
const cache = new Map();

async function cachedNode(state: typeof State.State) {
  const key = state.cacheKey;

  if (cache.has(key)) {
    logger.debug('Cache hit', { key });
    return { result: cache.get(key) };
  }

  const result = await expensiveOperation(state.input);
  cache.set(key, result);

  return { result };
}
```

---

### 5. Profile Execution

```typescript
async function profiledNode(state: typeof State.State) {
  const start = Date.now();

  const result = await operation(state.input);

  const duration = Date.now() - start;
  logger.info('Node execution time', { duration });

  return { result };
}
```

---

## Testing Strategies

### 1. Unit Test Nodes

```typescript
import { describe, test, expect } from 'vitest';

describe('processNode', () => {
  test('transforms input correctly', () => {
    const state = { input: 'hello', output: '' };
    const result = processNode(state);
    expect(result.output).toBe('HELLO');
  });

  test('handles empty input', () => {
    const state = { input: '', output: '' };
    const result = processNode(state);
    expect(result.output).toBe('');
  });
});
```

---

### 2. Test Routing Logic

```typescript
describe('router', () => {
  test('routes to fast path for high priority', () => {
    const state = { priority: 'high' };
    expect(router(state)).toBe('fast_path');
  });

  test('routes to slow path for low priority', () => {
    const state = { priority: 'low' };
    expect(router(state)).toBe('slow_path');
  });
});
```

---

### 3. Integration Test Full Graph

```typescript
describe('workflow', () => {
  test('completes full workflow', async () => {
    const app = workflow.compile();

    const result = await app.invoke({
      input: 'test',
      output: '',
    });

    expect(result.output).toBeDefined();
    expect(result.output).not.toBe('');
  });

  test('handles errors gracefully', async () => {
    const app = workflow.compile();

    const result = await app.invoke({
      input: 'invalid',
      output: '',
    });

    expect(result.error).toBeDefined();
  });
});
```

---

### 4. Test with Mocks

```typescript
import { vi } from 'vitest';

test('node handles API failure', async () => {
  // Mock external dependency
  const mockFetch = vi.fn().mockRejectedValue(new Error('API Error'));

  const node = createNode(mockFetch);
  const state = { url: 'http://api.example.com' };

  const result = await node(state);

  expect(result.error).toBe('API Error');
  expect(mockFetch).toHaveBeenCalledWith('http://api.example.com');
});
```

---

## Debugging Tools

### Custom Logger

```typescript
class GraphLogger {
  private nodeExecutions: Map<string, number> = new Map();

  logNodeEntry(name: string, state: any) {
    const count = (this.nodeExecutions.get(name) || 0) + 1;
    this.nodeExecutions.set(name, count);

    console.log(`[${count}] Entering ${name}`);
    console.log('State:', JSON.stringify(state, null, 2));
  }

  logNodeExit(name: string, updates: any) {
    console.log(`Exiting ${name}`);
    console.log('Updates:', JSON.stringify(updates, null, 2));
  }

  getSummary() {
    return {
      totalNodes: this.nodeExecutions.size,
      executions: Object.fromEntries(this.nodeExecutions),
    };
  }
}
```

---

### State Differ

```typescript
function diffStates(before: any, after: any): string[] {
  const changes: string[] = [];

  for (const key in after) {
    if (before[key] !== after[key]) {
      changes.push(`${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
    }
  }

  return changes;
}
```

---

## Next Steps

- Review [concepts.md](./concepts.md) for foundational understanding
- Study [patterns.md](./patterns.md) for best practices
- Run the examples with debugging enabled

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [Debugging Guide](https://langchain-ai.github.io/langgraphjs/how-tos/debug/)
