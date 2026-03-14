# Test-Driven Flow Development Pattern

## The 5-Layer Pipeline

Every LangGraph flow follows the same progression from prompt to production. Each layer is independently testable.

```
Layer 1: Prompt        Define data I/O contract (Zod schema)
Layer 2: Tool          Inference call + JSON parse
Layer 3: API           Express endpoint for isolated testing
Layer 4: StateGraph    Compose nodes with mock data (FakeChatModel)
Layer 5: Production    Swap real models, add observability, fine-tune
```

### Layer 1: Prompt — Define the Contract

Start with a Zod schema defining what goes in and what comes out.

```typescript
import { z } from 'zod';
import { Annotation } from '@langchain/langgraph';
import { appendReducer } from '@protolabsai/flows';

// Define the shape of your data
const FindingSchema = z.object({
  source: z.enum(['web', 'codebase', 'existing_content']),
  topic: z.string(),
  content: z.string(),
  relevance: z.enum(['high', 'medium', 'low']),
});

// Create state annotation with reducers
const ResearchState = Annotation.Root({
  topic: Annotation<string>(),
  findings: Annotation<z.infer<typeof FindingSchema>[]>({
    reducer: appendReducer,
    default: () => [],
  }),
  errors: Annotation<string[]>({
    reducer: appendReducer,
    default: () => [],
  }),
});
```

**Test**: Schema validates, annotation compiles, defaults work.

### Layer 2: Tool — Inference + Parse

Each node is a pure function: state in, partial state out. The LLM call is wrapped with model fallback.

```typescript
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

async function researchNode(
  state: typeof ResearchState.State
): Promise<Partial<typeof ResearchState.State>> {
  const { topic, smartModel, fastModel } = state;

  const result = await executeWithFallback(
    { primary: smartModel, fallback: fastModel },
    async (model) => {
      const response = await model.invoke([
        { role: 'user', content: `Research: "${topic}". Return JSON array of findings.` },
      ]);
      return FindingSchema.array().parse(JSON.parse(response.content.toString()));
    },
    'ResearchNode'
  );

  return { findings: result };
}
```

**Test**: Mock model returns valid JSON, schema validates, fallback triggers on error.

### Layer 3: API — Isolated Testing

Expose the node as an Express endpoint for manual testing and integration.

```typescript
// apps/server/src/routes/flows/research.ts
router.post('/research', async (req, res) => {
  const { topic } = req.body;
  const result = await researchNode({
    topic,
    smartModel: getModel('sonnet'),
    fastModel: getModel('haiku'),
    findings: [],
    errors: [],
  });
  res.json(result);
});
```

**Test**: `curl -X POST localhost:3008/api/flows/research -d '{"topic":"LangGraph"}'`

### Layer 4: StateGraph — Compose with Mocks

Wire nodes into a graph using `GraphBuilder`. Use `TestChatModel` for deterministic testing.

```typescript
import { GraphBuilder, createTestModels } from '@protolabsai/flows';

const graph = new GraphBuilder(ResearchState)
  .setEntryPoint('research')
  .addNode('research', researchNode)
  .addNode('analyze', analyzeNode)
  .addNode('summarize', summarizeNode)
  .addEdge('research', 'analyze')
  .addEdge('analyze', 'summarize')
  .setFinishPoint('summarize')
  .compile();

// Test with mock models
const { smartModel, fastModel } = createTestModels();
const result = await graph.invoke({
  topic: 'Test topic',
  smartModel,
  fastModel,
});
```

**Test**: Full graph executes with mock data, state flows correctly, no API calls.

### Layer 5: Production — Real Models + Observability

Swap mocks for real models, add Langfuse tracing, configure fallbacks.

```typescript
import { LangfuseClient, executeTrackedPrompt } from '@protolabsai/observability';

const langfuse = new LangfuseClient();
const smartModel = ProviderFactory.create('anthropic', {
  modelId: 'claude-sonnet-4-5-20250929',
});

// Wrap node with tracing
async function tracedResearchNode(state) {
  return executeTrackedPrompt(langfuse, 'research-node', {
    fallbackPrompt: 'Research: {{TOPIC}}',
    variables: { TOPIC: state.topic },
    executor: async (prompt) => researchNode({ ...state, smartModel }),
  });
}
```

**Test**: Real API calls, Langfuse traces visible, latency/cost tracking active.

## Key Patterns

### Model Fallback Chain

Always provide smart (expensive/capable) and fast (cheap/quick) models. The `executeWithFallback()` utility handles retry logic.

### Subgraph Isolation

Use `wrapSubgraph()` when composing flows to prevent state leakage between parent and child graphs.

### Dynamic Parallelism

Use `Send()` for fan-out to variable numbers of workers (e.g., one research worker per topic).

### HITL Interrupts

Use `interruptBefore: ['node_name']` with `MemorySaver` checkpointer for human review gates.

### Graceful Degradation

Workers should return error objects, never crash. The aggregator handles partial results.

## Package Map

| Package                      | Role                             | Key Exports                                                              |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `@protolabsai/flows`         | State graphs, reducers, builders | `GraphBuilder`, `createStateAnnotation`, `appendReducer`, `wrapSubgraph` |
| `@protolabsai/observability` | Langfuse tracing + cost tracking | `LangfuseClient`, `wrapProviderWithTracing`                              |

## Existing Implementations

The content pipeline in `libs/flows/src/content/` demonstrates all 5 layers:

- **State**: `ContentPipelineState` annotation with typed reducers
- **Nodes**: Research workers, section writer, assembler, output generators
- **Subgraphs**: SectionWriter (retry + validation), Research (parallel workers + HITL)
- **Parallelism**: `Send()` for research workers and output formats
- **Testing**: `TestChatModel` + `createTestModels()` factory
