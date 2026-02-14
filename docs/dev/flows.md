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
├── content/
│   ├── content-creation-flow.ts    # Main 6-phase content pipeline
│   ├── state.ts                    # ContentStateAnnotation
│   ├── types.ts                    # Zod schemas: BlogPost, TechDoc, etc.
│   ├── prompt-loader.ts            # Handlebars prompt compilation
│   ├── prompts/                    # .md prompt templates
│   ├── nodes/
│   │   ├── outline-planner.ts      # Outline generation + HITL
│   │   ├── generation-dispatch.ts  # Section generation fan-out
│   │   └── review-workers.ts       # Technical/style/fact reviewers
│   └── subgraphs/
│       ├── research-subgraph.ts    # Parallel research workers
│       ├── section-writer.ts       # Isolated per-section generation
│       └── review-subgraph.ts      # Parallel review pipeline
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

## Content Creation Flow

The content creation pipeline is the primary production flow in `@automaker/flows`. It generates blog posts, technical documentation, training data, and HuggingFace dataset rows through a 6-phase pipeline with parallel processing and human-in-the-loop gates.

### Architecture

```mermaid
graph TD
    START([START]) --> generate_queries[Generate Research Queries]

    %% Phase 1: Research
    generate_queries --> fan_out_research[Fan Out Research]
    fan_out_research -->|Send| research_delegate_1[Research Worker 1]
    fan_out_research -->|Send| research_delegate_2[Research Worker 2]
    fan_out_research -->|Send| research_delegate_n[Research Worker N]
    research_delegate_1 --> research_hitl{HITL: Research Review}
    research_delegate_2 --> research_hitl
    research_delegate_n --> research_hitl

    %% Phase 2: Outline
    research_hitl -->|approved| generate_outline[Generate Outline]
    research_hitl -->|revise| generate_queries
    generate_outline --> outline_hitl{HITL: Outline Approval}

    %% Phase 3: Section Generation
    outline_hitl -->|approved| fan_out_generation[Fan Out Sections]
    outline_hitl -->|revise| generate_outline
    fan_out_generation -->|Send| gen_delegate_1[SectionWriter 1]
    fan_out_generation -->|Send| gen_delegate_2[SectionWriter 2]
    fan_out_generation -->|Send| gen_delegate_n[SectionWriter N]

    %% Phase 4: Assembly
    gen_delegate_1 --> assemble[Assemble Document]
    gen_delegate_2 --> assemble
    gen_delegate_n --> assemble

    %% Phase 5: Review
    assemble --> fan_out_review[Fan Out Reviews]
    fan_out_review -->|Send| review_tech[Technical Reviewer]
    fan_out_review -->|Send| review_style[Style Reviewer]
    fan_out_review -->|Send| review_fact[Fact Checker]
    review_tech --> final_review_hitl{HITL: Final Review}
    review_style --> final_review_hitl
    review_fact --> final_review_hitl

    %% Phase 6: Output
    final_review_hitl -->|approved| fan_out_output[Fan Out Output]
    final_review_hitl -->|revise| fan_out_generation
    fan_out_output -->|Send| output_blog[Blog Formatter]
    fan_out_output -->|Send| output_doc[Doc Formatter]
    fan_out_output -->|Send| output_training[Training Data]
    fan_out_output -->|Send| output_hf[HF Dataset Row]
    output_blog --> complete[Complete]
    output_doc --> complete
    output_training --> complete
    output_hf --> complete
    complete --> END([END])
```

### Phases

| Phase         | Nodes                                                         | Parallelism              | HITL Gate        |
| ------------- | ------------------------------------------------------------- | ------------------------ | ---------------- |
| 1. Research   | `generate_queries` → `fan_out_research` → `research_delegate` | Send() per query         | Research review  |
| 2. Outline    | `generate_outline`                                            | Sequential               | Outline approval |
| 3. Generation | `fan_out_generation` → `generation_delegate` (SectionWriter)  | Send() per section       | None             |
| 4. Assembly   | `assemble`                                                    | Sequential               | None             |
| 5. Review     | `fan_out_review` → `review_delegate`                          | Send() per reviewer type | Final review     |
| 6. Output     | `fan_out_output` → `output_delegate`                          | Send() per format        | None             |

### Key Design Decisions

- **SectionWriter is a subgraph** — Each section generates in its own isolated StateGraph via `wrapSubgraph()`, preventing message pollution between sections.
- **3 HITL gates using `interrupt()`** — Research review, outline approval, and final review. Uses `MemorySaver` checkpointer to persist state across interruptions.
- **Reducers on all parallel fields** — `researchResults`, `sections`, `reviewFeedback`, and `outputs` all use `appendReducer` for safe concurrent merging.
- **Antagonistic 8-dimension review** — Technical accuracy, style/voice, fact-checking scored independently by separate workers.
- **Blog strategy extensions** — ContentConfig supports A/B testing, revenue goal routing, SEO config, CTA placement, and 8 blog template types.

### Usage

```typescript
import { createContentCreationFlow } from '@automaker/flows';

const flow = createContentCreationFlow();
const compiled = flow.compile();

const result = await compiled.invoke({
  config: {
    topic: 'Building LangGraph Flows',
    contentType: 'blog_post',
    targetAudience: 'AI engineers',
    length: 'long',
    blogTemplate: 'tutorial',
  },
});

// result.outputs contains formatted content for each output type
```

### Output Types (Zod-validated)

- `BlogPost` — Full blog with frontmatter, SEO metadata, sections, code examples
- `TechDoc` — Technical documentation with API references
- `TrainingExample` — LLM fine-tuning data (system/user/assistant messages)
- `HFDatasetRow` — HuggingFace dataset format with metadata

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
