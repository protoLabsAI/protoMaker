# Building flows

This guide shows you how to compose multi-step agent workflows using LangGraph and the flow utilities in `@@PROJECT_NAME-flows`.

## What flows are for

Single-turn agents handle one question at a time. Flows are for tasks that require multiple coordinated steps — research pipelines, document processing chains, multi-agent review loops, or human-in-the-loop approval workflows.

`@@PROJECT_NAME-flows` provides graph builders, routers, and reducers that make LangGraph graphs easier to construct and maintain.

## Install LangGraph

LangGraph is an optional peer dependency. Install it in the package where you're building flows:

```bash
cd packages/flows  # or packages/server
npm install @langchain/langgraph @langchain/core
```

## Your first flow: linear pipeline

A linear flow runs nodes in sequence, passing state from one to the next.

```typescript
import { createLinearGraph } from '@@PROJECT_NAME-flows';
import { z } from 'zod';

// 1. Define state shape
const ResearchState = z.object({
  topic: z.string(),
  outline: z.string().optional(),
  draft: z.string().optional(),
  finalReport: z.string().optional(),
});

type ResearchState = z.infer<typeof ResearchState>;

// 2. Define nodes (pure async functions)
async function planResearch(state: ResearchState): Promise<Partial<ResearchState>> {
  const outline = await llm.generate(`Create an outline for: ${state.topic}`);
  return { outline };
}

async function writeDraft(state: ResearchState): Promise<Partial<ResearchState>> {
  const draft = await llm.generate(`Write a draft from this outline: ${state.outline}`);
  return { draft };
}

async function finalizeReport(state: ResearchState): Promise<Partial<ResearchState>> {
  const finalReport = await llm.generate(`Polish and finalize: ${state.draft}`);
  return { finalReport };
}

// 3. Build and compile the graph
const graph = createLinearGraph({
  nodes: [
    { id: 'plan', fn: planResearch },
    { id: 'write', fn: writeDraft },
    { id: 'finalize', fn: finalizeReport },
  ],
  stateSchema: ResearchState,
});

const compiled = graph.compile();

// 4. Run it
const result = await compiled.invoke({ topic: 'LangGraph state management' });
console.log(result.finalReport);
```

## Branching flows

Branching flows route to different nodes based on state values.

```typescript
import { createBranchingGraph, createBinaryRouter } from '@@PROJECT_NAME-flows';

// Router decides the next node based on current state
const qualityRouter = createBinaryRouter<{ score: number }>(
  (state) => state.score >= 0.8, // condition
  'publish', // true branch
  'revise' // false branch
);

const graph = createBranchingGraph({
  nodes: [
    { id: 'evaluate', fn: evaluateQuality },
    { id: 'revise', fn: reviseContent },
    { id: 'publish', fn: publishContent },
  ],
  router: qualityRouter,
  routerSourceNode: 'evaluate',
  stateSchema: ContentState,
});
```

## Looping flows

Loop flows cycle until a stopping condition is met.

```typescript
import { createLoopGraph } from '@@PROJECT_NAME-flows';

const graph = createLoopGraph({
  nodes: [
    { id: 'attempt', fn: attemptSolution },
    { id: 'validate', fn: validateSolution },
  ],
  // Loop continues while this returns true
  shouldContinue: (state) => !state.solutionValid && state.attempts < 5,
  stateSchema: SolverState,
});
```

## State reducers

When multiple nodes update the same state field, reducers control how the updates merge.

```typescript
import {
  createStateAnnotation,
  appendReducer,
  counterReducer,
  idDedupAppendReducer,
} from '@@PROJECT_NAME-flows';

const AgentState = createStateAnnotation({
  // Replace on each update (default)
  currentTask: null as string | null,

  // Append each agent's output to the list
  agentOutputs: appendReducer<string>(),

  // Track how many retries have occurred
  retryCount: counterReducer(),

  // Accumulate results without duplicates (matched by .id)
  results: idDedupAppendReducer<{ id: string; data: unknown }>(),
});
```

Available reducers:

| Reducer                | Behavior                               |
| ---------------------- | -------------------------------------- |
| `appendReducer`        | Concatenates arrays                    |
| `replaceReducer`       | Overwrites with latest value (default) |
| `counterReducer`       | Adds numeric increments                |
| `maxReducer`           | Keeps the maximum value                |
| `minReducer`           | Keeps the minimum value                |
| `mapMergeReducer`      | Deep-merges objects                    |
| `setUnionReducer`      | Merges sets, removes duplicates        |
| `idDedupAppendReducer` | Appends items, deduplicates by `.id`   |

## Routers

Routers decide which node to run next based on state.

```typescript
import {
  createBinaryRouter,
  createValueRouter,
  createSequentialRouter,
  createFieldRouter,
} from '@@PROJECT_NAME-flows';

// Route on a boolean condition
const binaryRouter = createBinaryRouter((state) => state.isValid, 'success-node', 'error-node');

// Route based on an enum value in state
const valueRouter = createValueRouter<{ decision: 'approve' | 'reject' | 'revise' }>(
  (state) => state.decision,
  {
    approve: 'publish-node',
    reject: 'archive-node',
    revise: 'editor-node',
  }
);

// Combine routers: A AND B must both pass
const combinedRouter = combineRoutersAnd(binaryRouter, qualityRouter);
```

## XML parsing for structured LLM output

When a model returns structured data in XML tags, use the zero-dependency XML utilities:

```typescript
import { extractTag, extractTaggedJSON, extractBoolean } from '@@PROJECT_NAME-flows';

const llmOutput = `
<decision>approve</decision>
<confidence>0.92</confidence>
<metadata>{"reason": "meets all criteria", "score": 95}</metadata>
`;

const decision = extractTag(llmOutput, 'decision'); // 'approve'
const confidence = extractTag(llmOutput, 'confidence'); // '0.92'
const metadata = extractTaggedJSON(llmOutput, 'metadata'); // { reason: '...', score: 95 }
```

This is useful when you want structured output without JSON mode — the model can reason in prose and then emit structured values inside XML tags.

## Human-in-the-loop with subgraph bridges

Use `createSubgraphBridge` to pause a flow and wait for human input:

```typescript
import { createSubgraphBridge } from '@@PROJECT_NAME-flows';

const approvalBridge = createSubgraphBridge({
  // Subgraph that runs when approval is needed
  subgraph: reviewSubgraph,

  // Check if approval is pending in current state
  hasPendingApproval: (state) => state.pendingApprovalId != null,

  // Map parent state to subgraph input
  mapToSubgraphState: (state) => ({ documentId: state.documentId }),

  // Map subgraph output back to parent state
  mapFromSubgraphState: (subState, parentState) => ({
    ...parentState,
    approved: subState.approved,
    pendingApprovalId: null,
  }),
});
```

## Visual flow builder

The app includes a visual flow builder at `/flows`. You can:

1. Drag-drop five node types: **Agent**, **Tool**, **Condition**, **State**, **HITL** (human-in-the-loop)
2. Connect nodes with edges
3. Export the graph as TypeScript LangGraph code

The exported code uses `@@PROJECT_NAME-flows` utilities, so it's immediately compatible with your project's tool registry and state management.

## Running a flow from the server

Wire a flow to an HTTP endpoint in `packages/server`:

```typescript
// packages/server/src/routes/research.ts
import { compiled as researchGraph } from '../flows/research-flow.js';

router.post('/api/research', async (req, res) => {
  const { topic } = req.body;
  const result = await researchGraph.invoke({ topic });
  res.json({ report: result.finalReport });
});
```

For long-running flows, stream intermediate steps back to the client:

```typescript
router.post('/api/research/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');

  const stream = await researchGraph.stream({ topic: req.body.topic });

  for await (const event of stream) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  res.end();
});
```
