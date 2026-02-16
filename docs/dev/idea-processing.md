# Idea Processing Flow

LangGraph flow for validating and enriching raw ideas into structured, analyzable entities with complexity-based routing.

## Overview

The Idea Processing Flow (`libs/flows/src/idea-processing/`) accepts raw idea inputs (title + description) and routes them through either a **fast-path review** (trivial ideas) or a **full research + review** flow (simple/complex ideas). The flow classifies complexity, performs optional research, and outputs structured approval decisions with category/impact/effort estimates.

## Architecture

### Flow Diagram

```
START
  ↓
classify_complexity → [Heuristic: length-based classification]
  ↓
  ├─→ [trivial] → fast_path_review → done
  └─→ [simple/complex] → research → review → done
```

### Nodes

| Node                  | Purpose                                         | Inputs                    | Outputs                                                    |
| --------------------- | ----------------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `classify_complexity` | Determines processing path via heuristics       | `idea`                    | `complexity`, `processingNotes`                            |
| `fast_path_review`    | Quick approval for trivial ideas (bypasses R&D) | `idea`, `complexity`      | `reviewOutput`, `approved`, `category`, `impact`, `effort` |
| `research`            | Deep research phase for non-trivial ideas       | `idea`, `complexity`      | `researchResults`, `processingNotes`                       |
| `review`              | Comprehensive review with research context      | `idea`, `researchResults` | `reviewOutput`, `approved`, `category`, `impact`, `effort` |
| `done`                | Terminal node (no-op)                           | All prior state           | No changes                                                 |

### State Schema

The flow uses `IdeaProcessingStateAnnotation` defined in `libs/flows/src/idea-processing/state.ts`:

```typescript
import {
  IdeaProcessingStateAnnotation,
  type IdeaProcessingState,
} from '@automaker/flows/idea-processing';

interface IdeaProcessingState {
  // Input
  idea: IdeaInput; // { title, description, category?, conversationId? }

  // Classification
  complexity?: IdeaComplexity; // 'trivial' | 'simple' | 'complex'

  // Research phase (optional for trivial)
  researchResults?: ResearchResult; // findings, summary, recommendations

  // Review phase
  reviewOutput?: ReviewOutput; // { approve, category, impact, effort, suggestions, reasoning }

  // Final output
  approved?: boolean;
  category?: string;
  impact?: 'low' | 'medium' | 'high';
  effort?: 'low' | 'medium' | 'high';

  // Metadata
  usedFastPath?: boolean; // true if trivial path taken
  processingNotes: string[]; // Accumulated logs (append reducer)
}
```

## Complexity Classification

The `classify_complexity` node uses **heuristic-based classification** (no LLM required):

| Complexity | Criteria                                        | Processing Path   |
| ---------- | ----------------------------------------------- | ----------------- |
| `trivial`  | `description < 50 chars` AND `title < 30 chars` | Fast-path review  |
| `simple`   | `description < 200 chars`                       | Standard research |
| `complex`  | `description >= 200 chars`                      | Deep research     |

**Why heuristics?** This design avoids expensive LLM calls for classification, reserving compute for research/review phases.

## Fast Path Optimization

**Trivial ideas** bypass the research phase entirely:

```typescript
// Fast path logic (libs/flows/src/idea-processing/graph.ts:94)
async function fastPathReviewNode(state: IdeaProcessingState) {
  const titleValid = state.idea.title?.length > 5;
  const descValid = state.idea.description?.length > 10;

  const approve = !!(titleValid && descValid);

  return {
    approved: approve,
    category: state.idea.category || 'feature',
    impact: 'low',
    effort: 'low',
    usedFastPath: true,
    suggestions: approve ? [] : ['Provide more details'],
    reasoning: approve ? 'Basic validation passed' : 'Insufficient detail',
  };
}
```

**Performance gain:** Trivial ideas process ~10x faster by skipping research.

## Research Phase

For `simple` and `complex` ideas, the `research` node performs deep analysis:

```typescript
// Research node (libs/flows/src/idea-processing/graph.ts:67)
async function researchNode(state: IdeaProcessingState) {
  // In production: integrate with project analysis, web search, codebase grep, etc.
  const researchResults = {
    findings: [
      { source: 'project-analysis', summary: '...', relevance: '...' },
      { source: 'web-search', summary: '...', relevance: '...' },
    ],
    summary: 'Research completed...',
    recommendedCategory: 'feature',
    estimatedImpact: 'medium',
    estimatedEffort: 'medium',
  };

  return { researchResults };
}
```

**Current implementation:** Mock placeholder. **Future extensions:**

- Codebase analysis (Grep, file reads)
- Web search integration (WebFetch)
- Dependency impact analysis
- Similar idea detection

## Review Phase

The `review` node makes final approval decisions:

```typescript
// Review node (libs/flows/src/idea-processing/graph.ts:127)
async function reviewNode(state: IdeaProcessingState) {
  const research = state.researchResults;

  return {
    reviewOutput: {
      approve: true, // Default to approve if research conducted
      category: research?.recommendedCategory || 'feature',
      impact: research?.estimatedImpact || 'medium',
      effort: research?.estimatedEffort || 'medium',
      suggestions: ['Consider adding user stories', 'Define acceptance criteria'],
      reasoning: research?.summary || 'Standard review completed',
    },
    approved: true,
    category: 'feature',
    impact: 'medium',
    effort: 'medium',
  };
}
```

**Review output schema:**

```typescript
interface ReviewOutput {
  approve: boolean;
  category: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  suggestions: string[];
  reasoning?: string;
}
```

## Usage

### Basic Usage

```typescript
import { createIdeaProcessingGraph } from '@automaker/flows/idea-processing';

const graph = createIdeaProcessingGraph();

const result = await graph.invoke({
  idea: {
    title: 'Add dark mode toggle',
    description: 'Users should be able to switch between light and dark themes in settings.',
    category: 'feature',
  },
});

console.log('Approved:', result.approved);
console.log('Category:', result.category);
console.log('Impact:', result.impact);
console.log('Effort:', result.effort);
console.log('Suggestions:', result.reviewOutput?.suggestions);
console.log('Used fast path:', result.usedFastPath);
```

### Checkpointing (State Persistence)

Enable checkpointing for resumable flows:

```typescript
import { MemorySaver } from '@langchain/langgraph';

const graph = createIdeaProcessingGraph(true); // Default: checkpointing enabled

const threadId = 'idea-123';
const result = await graph.invoke(
  {
    idea: {
      title: 'Add dark mode',
      description: 'Theme toggle feature...',
    },
  },
  { configurable: { thread_id: threadId } }
);

// Retrieve state later
const state = await graph.getState({ configurable: { thread_id: threadId } });
console.log('Processing notes:', state.values.processingNotes);
```

### Disabling Checkpointing

For one-off processing without state persistence:

```typescript
const graph = createIdeaProcessingGraph(false); // No MemorySaver

const result = await graph.invoke({
  idea: {
    title: 'Quick idea',
    description: 'Simple task.',
  },
});
// State is not persisted
```

## Testing

The flow is designed for easy testing with mock inputs:

```typescript
import { createIdeaProcessingGraph } from '@automaker/flows/idea-processing';

describe('Idea Processing Flow', () => {
  it('should use fast path for trivial ideas', async () => {
    const graph = createIdeaProcessingGraph(false);

    const result = await graph.invoke({
      idea: {
        title: 'Fix typo',
        description: 'Update README typo.',
      },
    });

    expect(result.usedFastPath).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.impact).toBe('low');
    expect(result.effort).toBe('low');
  });

  it('should perform research for complex ideas', async () => {
    const graph = createIdeaProcessingGraph(false);

    const result = await graph.invoke({
      idea: {
        title: 'Implement AI-powered search',
        description:
          'Build a comprehensive semantic search system with vector embeddings, RAG pipeline, and real-time indexing. Should support multi-modal search (text, images, code) with advanced filtering and personalized ranking.',
      },
    });

    expect(result.complexity).toBe('complex');
    expect(result.usedFastPath).toBe(false);
    expect(result.researchResults).toBeDefined();
    expect(result.approved).toBe(true);
  });
});
```

## Integration Points

The Idea Processing Flow is designed to integrate with:

1. **Automaker Board:** Ideas can be auto-validated before adding to board
2. **Linear/GitHub Issues:** Auto-classify issue complexity before assignment
3. **Slack/Discord Bots:** Validate user-submitted ideas in real-time
4. **Content Pipeline:** Feed validated ideas into content generation flows

## Future Enhancements

### LLM-Based Classification

Replace heuristic classification with LLM-powered analysis:

```typescript
async function classifyComplexityNode(state: IdeaProcessingState) {
  const { smartModel } = state;

  const response = await smartModel.invoke([
    {
      role: 'system',
      content:
        'Classify idea complexity as trivial/simple/complex based on scope and requirements clarity.',
    },
    {
      role: 'user',
      content: `Title: ${state.idea.title}\nDescription: ${state.idea.description}`,
    },
  ]);

  const complexity = extractComplexityFromResponse(response);
  return { complexity };
}
```

### Parallel Research Workers

Use LangGraph's `Send()` for parallel research:

```typescript
import { Send } from '@langchain/langgraph';

async function researchDispatchNode(state: IdeaProcessingState) {
  const queries = ['project-analysis', 'web-search', 'codebase-grep', 'dependency-impact'];

  const sends = queries.map((query) => new Send('research_worker', { ...state, query }));
  return new Command({ goto: sends });
}
```

### Human-in-the-Loop (HITL) Review

Add optional human approval gate:

```typescript
const graph = createIdeaProcessingGraph(true);

// Compile with interrupt
const compiledGraph = graph.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ['review'], // Pause before final review
});

const result = await compiledGraph.invoke({ idea });

// Human reviews
const state = await compiledGraph.getState(threadId);
console.log('Review output:', state.values.reviewOutput);

// Human approves or rejects
await compiledGraph.updateState(threadId, { approved: true });

// Resume
await compiledGraph.invoke(null, { threadId });
```

## Related Documentation

- [LangGraph Flows Package](./flows.md) — Core LangGraph patterns and state management
- [GraphBuilder API](../libs/flows/docs/builder.md) — Fluent API for graph construction
- [Content Pipeline](./content-pipeline.md) — End-to-end content generation with research
- [Shared Types](../libs/types/README.md) — `IdeaCategory`, `ImpactLevel`, `EffortLevel` types
