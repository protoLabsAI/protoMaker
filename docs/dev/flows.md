# Flows Package

`@automaker/flows` provides LangGraph state graph primitives for building multi-agent coordination flows. It includes state management utilities, typed reducers, routing helpers, a graph builder, and reference implementations of common patterns.

**Owner:** Sam (AI Agent Engineer)

## Package Structure

```
libs/flows/src/
├── graphs/
│   ├── state-utils.ts          # Zod-to-Annotation bridging
│   ├── reducers.ts             # Built-in state reducers
│   ├── routing.ts              # Conditional edge routers
│   ├── builder.ts              # GraphBuilder class + helpers
│   ├── research-flow.ts        # Reference: linear research flow
│   ├── review-flow.ts          # Reference: human-in-the-loop review
│   ├── coordinator-flow.ts     # Reference: Send() fan-out coordinator
│   ├── nodes/
│   │   ├── draft.ts            # Draft node for review flow
│   │   └── revise.ts           # Revise node for review flow
│   ├── subgraphs/
│   │   ├── researcher.ts       # Researcher subgraph
│   │   └── analyzer.ts         # Analyzer subgraph
│   └── utils/
│       └── subgraph-wrapper.ts # Subgraph isolation utility
└── index.ts
```

## Core Concepts

### State Annotations

LangGraph uses `Annotation.Root()` to define typed state. This package bridges Zod schemas to LangGraph annotations:

```typescript
import { createStateAnnotation, validateState } from '@automaker/flows';
import { z } from 'zod';

const schema = z.object({
  query: z.string(),
  results: z.array(z.string()),
  count: z.number(),
});

// Bridge Zod → LangGraph Annotation with custom reducers
const MyState = createStateAnnotation(schema, {
  results: (left, right) => [...left, ...right], // append reducer
  count: (left, right) => left + right, // counter reducer
});
```

Or define annotations directly (preferred for complex state):

```typescript
import { Annotation } from '@langchain/langgraph';

const MyState = Annotation.Root({
  task: Annotation<string>,
  results: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
});
```

### Reducers

Reducers define how parallel node outputs merge into shared state. Every field with a reducer can safely receive concurrent updates.

| Reducer                     | Behavior                                     | Use Case                                 |
| --------------------------- | -------------------------------------------- | ---------------------------------------- |
| `appendReducer`             | Concatenates arrays                          | Accumulating results from parallel nodes |
| `replaceReducer`            | Right replaces left                          | Latest-wins fields                       |
| `fileReducer`               | Deduplicates by `path`, newer timestamp wins | File operation tracking                  |
| `todoReducer`               | Deduplicates by `id`, merges fields          | Task tracking                            |
| `counterReducer`            | Sums numeric values                          | Counting across parallel branches        |
| `maxReducer` / `minReducer` | Returns max/min                              | Tracking extremes                        |
| `setUnionReducer`           | Set union                                    | Deduplicating tags/labels                |
| `mapMergeReducer`           | Map merge (right wins)                       | Key-value accumulation                   |

```typescript
import { appendReducer, fileReducer, counterReducer } from '@automaker/flows';
```

### Routing

Routers are functions that determine which node(s) to visit next based on current state.

```typescript
import {
  createBinaryRouter,
  createValueRouter,
  createFieldRouter,
  createSequentialRouter,
  createParallelRouter,
  createEndRouter,
} from '@automaker/flows';

// Binary: true/false → node A or B
const router = createBinaryRouter<MyState>(
  (state) => state.results.length > 0,
  'process_results',
  'fetch_more'
);

// Value-based: map a field value to a node
const modeRouter = createValueRouter<MyState, string>(
  (state) => state.mode,
  new Map([
    ['fast', 'quick_path'],
    ['thorough', 'deep_path'],
  ]),
  'default_path'
);

// Field shortcut (equivalent to createValueRouter with field accessor)
const fieldRouter = createFieldRouter<MyState, 'mode'>(
  'mode',
  new Map([['fast', 'quick_path']]),
  'default_path'
);

// Parallel: return multiple nodes for concurrent execution
const fanOut = createParallelRouter<MyState>((state) => state.queries.map((q) => `worker_${q}`));
```

### GraphBuilder

The `GraphBuilder` class provides a fluent API for constructing state graphs:

```typescript
import { GraphBuilder, END, START } from '@automaker/flows';

const builder = new GraphBuilder<MyState>({
  stateAnnotation: MyState,
  enableCheckpointing: true, // optional: persists state
});

builder
  .addNode('fetch', fetchNode)
  .addNode('process', processNode)
  .addNode('validate', validateNode)
  .setEntryPoint('fetch')
  .addEdge('fetch', 'process')
  .addConditionalEdge('process', router)
  .setFinishPoint('validate');

const compiled = builder.compile();
const result = await compiled.invoke({ query: 'test' });
```

**Convenience constructors** for common patterns:

```typescript
import { createLinearGraph, createLoopGraph, createBranchingGraph } from '@automaker/flows';

// Linear: A → B → C
const linear = createLinearGraph(config, [
  { name: 'step1', fn: step1 },
  { name: 'step2', fn: step2 },
  { name: 'step3', fn: step3 },
]);

// Loop: node → condition → node or END
const loop = createLoopGraph(config, {
  nodeName: 'iterate',
  nodeFunction: iterateFn,
  shouldContinue: (state) => state.iteration < 5,
});

// Branching: entry → router → branches → exit
const branching = createBranchingGraph(config, {
  entryNode: { name: 'classify', fn: classifyFn },
  branches: [
    { name: 'path_a', fn: pathAFn },
    { name: 'path_b', fn: pathBFn },
  ],
  router: classifyRouter,
  exitNode: { name: 'merge', fn: mergeFn },
});
```

## Advanced Patterns

### Coordinator + Send() Fan-Out

The coordinator pattern uses `Send()` for dynamic parallelism. A planning node determines what work needs to be done, then a fan-out node dynamically sends work to subgraphs.

```
planning → fan_out ──Send()──→ research_delegate ──→ aggregation
                   ──Send()──→ research_delegate ──↗
                   ──Send()──→ analyze_delegate  ──↗
```

```typescript
import { Send, Command } from '@langchain/langgraph';

async function fanOutNode(state: CoordinatorState) {
  const sends: Send[] = [];

  for (const query of state.researchQueries) {
    sends.push(new Send('research_delegate', { ...state, query }));
  }
  for (const data of state.analysisData) {
    sends.push(new Send('analyze_delegate', { ...state, data }));
  }

  return new Command({ goto: sends });
}
```

Key points:

- `Send()` creates a message to a specific node with custom state
- Results merge via reducers defined on the coordinator state
- Nodes receiving `Send()` must be declared with `{ ends: [...] }` in `addNode()`

### Subgraph Isolation

Subgraphs maintain their own message state, preventing pollution of the parent coordinator's history. Use `wrapSubgraph()`:

```typescript
import { wrapSubgraph } from '@automaker/flows';

const wrappedResearcher = wrapSubgraph<
  CoordinatorState, // parent state type
  ResearcherInput, // subgraph input type
  ResearcherOutput // subgraph output type
>(
  compiledResearcherGraph,
  // inputMapper: coordinator → subgraph
  (coordState) => ({
    query: coordState.query,
    findings: [],
    messages: [], // fresh message state
  }),
  // outputMapper: subgraph → coordinator
  (subState) => ({
    researchResults: [subState.result || ''],
  })
);

const result = await wrappedResearcher(coordinatorState);
```

### Lazy Subgraph Compilation

Compile subgraphs once at module level to avoid per-invocation overhead:

```typescript
let compiledGraph: ReturnType<ReturnType<typeof createMyGraph>['compile']> | null = null;

function getCompiledGraph() {
  if (!compiledGraph) {
    compiledGraph = createMyGraph().compile();
  }
  return compiledGraph;
}
```

## Reference Flows

### Research Flow (`createResearchFlow`)

Linear flow: gather → analyze → synthesize. Good starting point for simple pipelines.

### Review Flow (`createReviewFlow`)

Human-in-the-loop pattern: draft → review → revise (loop until approved). Uses `draft` and `revise` nodes from `graphs/nodes/`.

### Coordinator Flow (`createCoordinatorGraph`)

Full coordinator pattern with Send()-based fan-out to researcher and analyzer subgraphs. Supports parallel and sequential execution modes.

## Known Gotchas

- **LangGraph node name types:** `StateGraph` requires string literal types that match `'__start__'`. For dynamic edge building, cast to `any`: `const g = graph as any`.
- **Send() node declaration:** Nodes that are targets of `Send()` must be declared with `{ ends: [...targets] }` in `addNode()`.
- **Reducer defaults:** Always provide `default: () => []` for array fields with reducers, or the initial state will be `undefined`.

## Dependencies

```
@langchain/langgraph  # State graph runtime
zod                   # Schema validation
@automaker/utils      # Logging
```
