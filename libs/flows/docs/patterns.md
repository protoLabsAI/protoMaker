# LangGraph Graph Patterns

This document covers common graph patterns, best practices, and design strategies for building robust LangGraph workflows.

## Table of Contents

- [Workflow Patterns](#workflow-patterns)
- [Control Flow Patterns](#control-flow-patterns)
- [Error Handling Patterns](#error-handling-patterns)
- [Composition Patterns](#composition-patterns)
- [Best Practices](#best-practices)

## Workflow Patterns

### Linear Flow

**When to use:** Simple sequential processing without branching.

**Structure:**

```
entry → step_1 → step_2 → step_3 → exit
```

**Example:**

```typescript
const workflow = new StateGraph(State);

workflow.addNode('fetch', fetchData);
workflow.addNode('transform', transformData);
workflow.addNode('save', saveData);

workflow.setEntryPoint('fetch');
workflow.addEdge('fetch', 'transform');
workflow.addEdge('transform', 'save');
workflow.setFinishPoint('save');
```

**Pros:**

- Simple to understand and debug
- Predictable execution order
- Easy to test

**Cons:**

- No flexibility for branching logic
- All steps always execute

---

### Fan-Out/Fan-In

**When to use:** Parallel processing with aggregation.

**Structure:**

```
entry → router → [worker_1, worker_2, worker_3] → aggregator → exit
```

**Example:**

```typescript
const State = Annotation.Root({
  input: Annotation<string>(),
  results: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

function router(state: typeof State.State): string[] {
  return ['worker_1', 'worker_2', 'worker_3'];
}

workflow.addNode('worker_1', (state) => ({ results: ['Result 1'] }));
workflow.addNode('worker_2', (state) => ({ results: ['Result 2'] }));
workflow.addNode('worker_3', (state) => ({ results: ['Result 3'] }));
workflow.addNode('aggregate', (state) => {
  const combined = state.results.join(', ');
  return { output: combined };
});

workflow.setEntryPoint('router');
workflow.addConditionalEdges('router', router, {
  worker_1: 'aggregate',
  worker_2: 'aggregate',
  worker_3: 'aggregate',
});
```

**Note:** LangGraph doesn't support true parallel execution in a single graph. For parallel work, use Promise.all within a node or create separate graph instances.

---

### Conditional Branching

**When to use:** Different paths based on runtime conditions.

**Structure:**

```
entry → decision → [path_a, path_b, path_c] → merge → exit
```

**Example:**

```typescript
function router(state: typeof State.State): string {
  if (state.priority === 'high') {
    return 'fast_path';
  } else if (state.priority === 'medium') {
    return 'standard_path';
  } else {
    return 'slow_path';
  }
}

workflow.addConditionalEdges('decision', router, {
  fast_path: 'fast_processor',
  standard_path: 'standard_processor',
  slow_path: 'slow_processor',
});

// All paths merge to same exit
workflow.addEdge('fast_processor', 'finalize');
workflow.addEdge('standard_processor', 'finalize');
workflow.addEdge('slow_processor', 'finalize');
```

**Best practices:**

- Always handle all possible return values
- Document routing logic clearly
- Ensure all branches eventually reach exit

---

### Retry Loop

**When to use:** Operations that may fail and should be retried.

**Structure:**

```
entry → attempt → validate → [success] → exit
                     ↑          ↓
                     └──────[retry]
```

**Example:**

```typescript
const State = Annotation.Root({
  attempt: Annotation<number>({ reducer: (_, u) => u, default: () => 0 }),
  success: Annotation<boolean>({ reducer: (_, u) => u, default: () => false }),
  maxRetries: Annotation<number>({ reducer: (_, u) => u, default: () => 3 }),
});

async function attemptOperation(state: typeof State.State) {
  try {
    await riskyOperation();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      attempt: state.attempt + 1,
    };
  }
}

function retryRouter(state: typeof State.State): string {
  if (state.success) {
    return '__end__';
  } else if (state.attempt < state.maxRetries) {
    return 'attempt';
  } else {
    return 'failed';
  }
}

workflow.addNode('attempt', attemptOperation);
workflow.addNode('failed', (state) => ({ error: 'Max retries exceeded' }));

workflow.setEntryPoint('attempt');
workflow.addConditionalEdges('attempt', retryRouter, {
  attempt: 'attempt', // Cycle back
  failed: 'failed',
  __end__: '__end__',
});
```

**Important:** Always have a max retry limit to prevent infinite loops.

---

### Human-in-the-Loop

**When to use:** Workflows requiring human approval or input.

**Structure:**

```
entry → analyze → [auto/review] → human_review → [approve/reject] → execute/reject
```

**Example:**

```typescript
import { MemorySaver } from '@langchain/langgraph';

const checkpointer = new MemorySaver();

const app = workflow.compile({
  checkpointer,
  interruptBefore: ['human_review'],
});

// First call - pauses at human_review
let state = await app.invoke(input, config);

// Get human decision
const approval = await getUserInput();

// Resume with decision
state = await app.invoke({ ...state, approved: approval }, config);
```

**Best practices:**

- Use checkpointers for state persistence
- Set clear interrupt points
- Provide context for human decision
- Handle both approval and rejection paths

---

## Control Flow Patterns

### Early Exit

**When to use:** Skip remaining processing when conditions are met.

```typescript
function validator(state: typeof State.State): string {
  if (!state.data) {
    return '__end__'; // Early exit
  }
  return 'process';
}

workflow.addConditionalEdges('validate', validator, {
  process: 'process_node',
  __end__: '__end__',
});
```

---

### Guard Clauses

**When to use:** Validate preconditions before expensive operations.

```typescript
function guardNode(state: typeof State.State) {
  // Multiple guard conditions
  if (!state.authenticated) {
    return { error: 'Not authenticated', canProceed: false };
  }

  if (!state.hasPermission) {
    return { error: 'No permission', canProceed: false };
  }

  if (!state.validInput) {
    return { error: 'Invalid input', canProceed: false };
  }

  return { canProceed: true };
}

function router(state: typeof State.State): string {
  return state.canProceed ? 'execute' : '__end__';
}
```

---

### State Machine Pattern

**When to use:** Complex workflows with multiple states and transitions.

```typescript
const State = Annotation.Root({
  status: Annotation<'draft' | 'submitted' | 'approved' | 'rejected'>(),
});

function stateRouter(state: typeof State.State): string {
  switch (state.status) {
    case 'draft':
      return 'submit';
    case 'submitted':
      return 'review';
    case 'approved':
      return 'execute';
    case 'rejected':
      return 'notify';
    default:
      return '__end__';
  }
}
```

---

## Error Handling Patterns

### Try-Catch in Nodes

**Pattern:** Handle errors within nodes and store in state.

```typescript
const State = Annotation.Root({
  result: Annotation<any>(),
  error: Annotation<string | null>({ reducer: (_, u) => u, default: () => null }),
});

async function safeNode(state: typeof State.State) {
  try {
    const result = await riskyOperation(state.input);
    return { result, error: null };
  } catch (error) {
    logger.error('Operation failed:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function errorRouter(state: typeof State.State): string {
  return state.error ? 'handle_error' : 'continue';
}
```

---

### Error Handler Node

**Pattern:** Dedicated node for error handling and recovery.

```typescript
workflow.addNode('error_handler', (state) => {
  logger.error('Workflow error:', state.error);

  // Attempt recovery
  if (state.recoverable) {
    return { recovered: true, error: null };
  }

  // Or fail gracefully
  return {
    failed: true,
    userMessage: 'Operation failed. Please try again.',
  };
});

function router(state: typeof State.State): string {
  if (state.error) {
    return 'error_handler';
  }
  return 'continue';
}
```

---

### Validation Pattern

**Pattern:** Validate state at key points.

```typescript
function validateState(state: typeof State.State) {
  const errors: string[] = [];

  if (!state.requiredField) {
    errors.push('Missing required field');
  }

  if (state.value < 0) {
    errors.push('Value must be positive');
  }

  return {
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

workflow.addNode('validate', validateState);

function validationRouter(state: typeof State.State): string {
  return state.isValid ? 'proceed' : 'reject';
}
```

---

## Composition Patterns

### Subgraph Pattern

**When to use:** Reusable workflow components.

```typescript
// Create reusable subgraph
function createValidationSubgraph() {
  const subgraph = new StateGraph(ValidationState);

  subgraph.addNode('check_format', checkFormat);
  subgraph.addNode('check_constraints', checkConstraints);

  subgraph.setEntryPoint('check_format');
  subgraph.addEdge('check_format', 'check_constraints');
  subgraph.setFinishPoint('check_constraints');

  return subgraph.compile();
}

// Use in parent graph
async function validateNode(state: typeof ParentState.State) {
  const validator = createValidationSubgraph();

  const result = await validator.invoke({
    data: state.input,
    isValid: false,
    errors: [],
  });

  return {
    validated: result.isValid,
    validationErrors: result.errors,
  };
}

workflow.addNode('validate', validateNode);
```

**Benefits:**

- Code reuse
- Separation of concerns
- Easier testing
- Modular design

---

### Pipeline Pattern

**When to use:** Multiple sequential transformations.

```typescript
const pipelines = ['normalize', 'validate', 'enrich', 'transform', 'format'];

pipelines.forEach((name, index) => {
  workflow.addNode(name, pipelineFunctions[name]);

  if (index > 0) {
    workflow.addEdge(pipelines[index - 1], name);
  }
});

workflow.setEntryPoint(pipelines[0]);
workflow.setFinishPoint(pipelines[pipelines.length - 1]);
```

---

### Factory Pattern

**When to use:** Creating graphs dynamically based on config.

```typescript
interface GraphConfig {
  includeValidation: boolean;
  includeEnrichment: boolean;
  processingStrategy: 'fast' | 'thorough';
}

function createGraph(config: GraphConfig) {
  const workflow = new StateGraph(State);

  workflow.addNode('input', inputNode);

  if (config.includeValidation) {
    workflow.addNode('validate', validateNode);
    workflow.addEdge('input', 'validate');
  }

  if (config.includeEnrichment) {
    workflow.addNode('enrich', enrichNode);
    // Connect based on previous nodes
  }

  // Add processing based on strategy
  const processor = config.processingStrategy === 'fast' ? fastProcessor : thoroughProcessor;
  workflow.addNode('process', processor);

  return workflow.compile();
}
```

---

## Best Practices

### 1. State Design

**Keep state minimal:**

```typescript
// ✅ Good: Only necessary fields
const State = Annotation.Root({
  input: Annotation<string>(),
  output: Annotation<string>(),
});

// ❌ Bad: Unnecessary fields
const State = Annotation.Root({
  input: Annotation<string>(),
  inputLength: Annotation<number>(), // Can compute from input
  inputUppercase: Annotation<string>(), // Can compute from input
  output: Annotation<string>(),
});
```

**Use descriptive names:**

```typescript
// ✅ Good
const State = Annotation.Root({
  userAuthToken: Annotation<string>(),
  isEmailVerified: Annotation<boolean>(),
});

// ❌ Bad
const State = Annotation.Root({
  token: Annotation<string>(),
  verified: Annotation<boolean>(),
});
```

---

### 2. Node Design

**Single responsibility:**

```typescript
// ✅ Good: Each node does one thing
workflow.addNode('fetch', fetchData);
workflow.addNode('validate', validateData);
workflow.addNode('transform', transformData);

// ❌ Bad: Doing everything in one node
workflow.addNode('fetchValidateTransform', doEverything);
```

**Return only updates:**

```typescript
// ✅ Good
function node(state: typeof State.State) {
  return { counter: state.counter + 1 };
}

// ❌ Bad
function node(state: typeof State.State) {
  return { ...state, counter: state.counter + 1 };
}
```

---

### 3. Error Handling

**Always handle errors:**

```typescript
// ✅ Good
async function node(state: typeof State.State) {
  try {
    const result = await operation();
    return { result, error: null };
  } catch (error) {
    return { error: error.message };
  }
}

// ❌ Bad: Unhandled errors crash the graph
async function node(state: typeof State.State) {
  const result = await operation(); // Can throw!
  return { result };
}
```

---

### 4. Testing

**Test nodes independently:**

```typescript
// Node function
function processNode(state: typeof State.State) {
  return { processed: state.input.toUpperCase() };
}

// Test
test('processNode converts to uppercase', () => {
  const state = { input: 'hello', processed: '' };
  const result = processNode(state);
  expect(result.processed).toBe('HELLO');
});
```

**Test routing logic:**

```typescript
test('router sends high priority to fast path', () => {
  const state = { priority: 'high' };
  const route = router(state);
  expect(route).toBe('fast_path');
});
```

---

### 5. Documentation

**Document complex routing:**

```typescript
/**
 * Routes based on data quality score:
 * - High (>0.8): Skip validation
 * - Medium (0.5-0.8): Standard validation
 * - Low (<0.5): Enhanced validation + human review
 */
function qualityRouter(state: typeof State.State): string {
  if (state.qualityScore > 0.8) return 'process';
  if (state.qualityScore > 0.5) return 'validate';
  return 'enhanced_validate';
}
```

---

### 6. Observability

**Add logging:**

```typescript
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('my-graph');

function node(state: typeof State.State) {
  logger.info('Processing node', { id: state.id });

  const result = process(state.data);

  logger.info('Node complete', { result });

  return { result };
}
```

**Track progress:**

```typescript
const State = Annotation.Root({
  steps: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

function node(state: typeof State.State) {
  return {
    result: process(state.input),
    steps: ['Processed data'],
  };
}
```

---

## Common Anti-Patterns to Avoid

### ❌ Mutating State

```typescript
// DON'T
function badNode(state: typeof State.State) {
  state.items.push('new'); // Mutates state!
  return state;
}

// DO
function goodNode(state: typeof State.State) {
  return { items: [...state.items, 'new'] };
}
```

### ❌ Infinite Loops

```typescript
// DON'T
workflow.addConditionalEdges('check', (state) => 'process'); // Always loops!

// DO
workflow.addConditionalEdges('check', (state) => (state.done ? '__end__' : 'process'));
```

### ❌ Missing Error Handling

```typescript
// DON'T
async function badNode(state: typeof State.State) {
  return { result: await riskyOperation() }; // Can throw!
}

// DO
async function goodNode(state: typeof State.State) {
  try {
    return { result: await riskyOperation(), error: null };
  } catch (error) {
    return { error: error.message };
  }
}
```

---

## Next Steps

- See [concepts.md](./concepts.md) for core LangGraph concepts
- See [debugging.md](./debugging.md) for debugging techniques
- Review the examples for working implementations

## References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [Design Patterns](https://langchain-ai.github.io/langgraphjs/how-tos/)
