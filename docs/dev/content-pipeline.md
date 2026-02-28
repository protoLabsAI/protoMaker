# Content Creation Pipeline

Multi-format content generation pipeline at `libs/flows/src/content/`. Transforms research into content (guides, tutorials, reference docs) using a 7-phase LangGraph flow with autonomous antagonistic review, parallel processing, and Langfuse tracing.

## GTM Gate

The content pipeline is part of the GTM branch and is gated by the `gtmEnabled` global setting (default: `false`). When disabled:

- All content API routes (`/api/content/*`) return 403
- Engine content draft/review endpoints return empty or 403
- The content pipeline node is hidden from the flow graph
- Signals that would route to GTM are forced to ops

Enable `gtmEnabled` in global settings to activate the content pipeline.

## Quick Start

Start a content flow via MCP:

```bash
# Create content
mcp__protolabs__create_content({
  projectPath: "/path/to/project",
  topic: "Building RAG Pipelines with LangGraph",
  format: "guide",
  tone: "conversational",
  audience: "intermediate"
})

# Check progress
mcp__protolabs__get_content_status({
  projectPath: "/path/to/project",
  runId: "content-1708123456789-abc123"
})

# Export when done
mcp__protolabs__export_content({
  projectPath: "/path/to/project",
  runId: "content-1708123456789-abc123",
  format: "markdown"
})
```

Output is written to `.automaker/content/{runId}/content.md`.

## Architecture

### Phase Diagram

```
generate_queries
      │
fan_out_research ──→ research_delegate (×N parallel)
      │
research_review (antagonistic)
      │
research_hitl (optional HITL gate)
      │
generate_outline
      │
outline_review (antagonistic)
      │
outline_hitl (optional HITL gate)
      │
fan_out_generation ──→ generation_delegate (×N parallel, SectionWriter subgraph)
      │
assemble
      │
fan_out_review ──→ review_delegate (×N parallel)
      │
final_content_review (antagonistic, 8-dimension)
      │
final_review_hitl (optional HITL gate)
      │
fan_out_output ──→ output_delegate (×N parallel)
      │
complete
```

### Phase Breakdown

| Phase              | Node(s)                                                                             | Parallelism | Purpose                                                |
| ------------------ | ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| 1. Research        | `generate_queries` → `fan_out_research` → `research_delegate`                       | ✓ Send()    | Generate 4-6 queries, fan out to parallel LLM research |
| 2. Research Review | `research_review` → `research_hitl`                                                 | -           | Antagonistic quality review with retry loop (max 2)    |
| 3. Outline         | `generate_outline` → `outline_review` → `outline_hitl`                              | -           | Generate outline from research, review with retry      |
| 4. Generation      | `fan_out_generation` → `generation_delegate`                                        | ✓ Send()    | Parallel section writing via SectionWriter subgraph    |
| 5. Assembly        | `assemble`                                                                          | -           | Combine sections into cohesive markdown document       |
| 6. Content Review  | `fan_out_review` → `review_delegate` → `final_content_review` → `final_review_hitl` | ✓ Send()    | Per-section review + 8-dimension final review          |
| 7. Output          | `fan_out_output` → `output_delegate` → `complete`                                   | ✓ Send()    | Format to markdown/html/pdf                            |

### Retry Logic

Each review gate has a retry loop with `maxRetries` (default: 2):

```
review_node
    │
    ├─ passed → next phase
    ├─ failed (retries < max) → increment_retry → regenerate
    └─ failed (retries >= max) → complete (with partial content)
```

### Key Files

| File                                                        | Purpose                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/flows/src/content/content-creation-flow.ts`           | Main graph definition, all node functions                          |
| `libs/flows/src/content/subgraphs/section-writer.ts`        | SectionWriter subgraph (per-section generation)                    |
| `libs/flows/src/content/subgraphs/antagonistic-reviewer.ts` | Antagonistic reviewer subgraph (quality scoring)                   |
| `apps/server/src/services/content-flow-service.ts`          | Service layer: flow lifecycle, status tracking, output persistence |
| `apps/server/src/routes/engine/index.ts`                    | Engine status API (includes content pipeline data)                 |

## ContentConfig

```typescript
interface ContentConfig {
  topic: string;
  format: 'tutorial' | 'reference' | 'guide';
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
  smartModel: BaseChatModel; // Sonnet — used for research, outline, generation, final review
  fastModel: BaseChatModel; // Haiku — used for section validation, formatting
  langfuseClient?: LangfuseClient; // Auto-injected by ContentFlowService
  enableHITL?: boolean; // Enable interrupt gates (default: false)
  maxRetries?: number; // Max retries per review phase (default: 2)
}
```

The `ContentFlowService` automatically:

- Creates `ChatAnthropic` instances for smart (Sonnet) and fast (Haiku) models
- Initializes a Langfuse trace and passes the client through config
- Tracks progress via WebSocket events

## Tracing & Observability

### Langfuse Integration

The content pipeline creates a Langfuse trace per flow run with generation spans for each LLM call and scores for each review gate.

**Automatic tracing** — `ContentFlowService.startFlow()` handles all Langfuse wiring:

1. Creates a root trace: `content:{topic}` tagged `content-pipeline`
2. Passes `langfuseClient` and `traceId` to the flow config
3. Each LLM call (`generate_queries`, `research_delegate`, `generate_outline`) creates a generation span
4. The `SectionWriter` subgraph creates generations when `langfuseClient` is provided
5. On completion, review scores are recorded as Langfuse scores
6. The `traceId` is saved in `metadata.json` for later retrieval

**Trace structure:**

```
Trace: content:{topic} [content-pipeline, format:{format}]
├── Generation: generate_queries (sonnet)
├── Generation: research_delegate:{query1} (sonnet)
├── Generation: research_delegate:{query2} (sonnet)
├── Generation: generate_outline (sonnet)
├── Generation: section_writer:{section1} (sonnet, via subgraph)
├── Generation: section_writer:{section2} (sonnet, via subgraph)
├── Score: research_quality (0-1)
├── Score: outline_quality (0-1)
└── Score: content_quality (0-1)
```

**Viewing traces:**

```bash
# List recent content traces
mcp__protolabs__langfuse_list_traces({ tags: ["content-pipeline"], limit: 10 })

# Get specific trace with cost data
mcp__protolabs__langfuse_get_trace({ traceId: "content-content-1708123456789-abc123" })
```

### Analytics Dashboard

The `/analytics` flow graph shows content pipeline status:

- **Active flows** with progress bars, current node, and review scores
- **Recent flows** (last 24h) with completion status
- **Langfuse trace links** for each flow
- **Review scores** displayed as R/O/C percentages (Research/Outline/Content)

The engine status API (`POST /api/engine/status`) returns expanded content pipeline data:

```json
{
  "contentPipeline": {
    "activeFlows": [{
      "runId": "content-...",
      "status": "running",
      "progress": 45,
      "currentNode": "generation_delegate",
      "topic": "Building RAG Pipelines",
      "traceId": "content-content-...",
      "reviewScores": { "research": { "percentage": 82, "passed": true } },
      "createdAt": 1708123456789
    }],
    "recentFlows": [...],
    "totalActive": 1,
    "pendingDrafts": 0
  }
}
```

## Antagonistic Review

The pipeline uses antagonistic review at 3 gates: after research, after outline, and after final assembly.

### How It Works

The `AntagonisticReviewerGraph` subgraph evaluates content across scoring dimensions. The reviewer is instructed to be intentionally critical — assume content is mediocre until proven excellent.

**Review modes:**

| Mode       | Gate                     | Dimensions                          |
| ---------- | ------------------------ | ----------------------------------- |
| `research` | After research phase     | Completeness, depth, source quality |
| `outline`  | After outline generation | Structure, coverage, flow           |
| `full`     | After content assembly   | 8 dimensions (see below)            |

### 8-Dimension Scoring (Full Review)

| Dimension   | What It Evaluates                    | Pass (7+)                                         |
| ----------- | ------------------------------------ | ------------------------------------------------- |
| Hook        | First 100 words grab attention       | Clear problem statement, hooks reader             |
| Clarity     | Easy to understand, well-structured  | Logical flow, clear explanations                  |
| Value       | Actionable insights, not just theory | Concrete examples, practical takeaways            |
| Engagement  | F-pattern scanning optimization      | Subheadings every 200-300 words, bold key phrases |
| SEO         | Keywords integrated naturally        | Primary keyword in H1, natural distribution       |
| Credibility | Authority signals present            | External links, data cited                        |
| CTA         | Call-to-action effectiveness         | Clear value proposition, good placement           |
| Completion  | Fully addresses user intent          | No gaps, objections addressed                     |

**Scoring thresholds:**

- 7+: Approved — proceed to output
- <7 (retries available): Regenerate with review feedback
- <7 (retries exhausted): Complete with partial content

## Output & Storage

### File Structure

```
.automaker/content/{runId}/
├── content.md        # Generated markdown content
├── content.html      # HTML output (if requested)
├── metadata.json     # Run metadata, review scores, trace ID
```

### metadata.json

```json
{
  "runId": "content-1708123456789-abc123",
  "topic": "Building RAG Pipelines with LangGraph",
  "format": "guide",
  "status": "completed",
  "outputPath": "/path/to/.automaker/content/content-1708123456789-abc123",
  "reviewScores": {
    "research": { "percentage": 82, "passed": true, "verdict": "..." },
    "outline": { "percentage": 78, "passed": true, "verdict": "..." },
    "content": { "percentage": 85, "passed": true, "verdict": "..." }
  },
  "traceId": "content-content-1708123456789-abc123",
  "createdAt": 1708123456789,
  "completedAt": 1708123500000
}
```

### Export Formats

```bash
mcp__protolabs__export_content({
  projectPath: "/path/to/project",
  runId: "content-...",
  format: "markdown"       # or "frontmatter-md", "jsonl", "hf-dataset"
})
```

| Format           | Output File              | Description                    |
| ---------------- | ------------------------ | ------------------------------ |
| `markdown`       | `content.md`             | Raw markdown (already exists)  |
| `frontmatter-md` | `content-frontmatter.md` | Markdown with YAML frontmatter |
| `jsonl`          | `content.jsonl`          | JSON Lines format              |
| `hf-dataset`     | `dataset.json`           | HuggingFace dataset entry      |

## HITL Mode (Optional)

By default, the pipeline runs fully autonomously. Set `enableHITL: true` to enable interrupt gates where the flow pauses for human review when critical issues are found.

HITL gates: `research_hitl`, `outline_hitl`, `final_review_hitl`.

```bash
# Start with HITL enabled
mcp__protolabs__create_content({
  projectPath: "/path/to/project",
  topic: "...",
  enableHITL: true
})

# Check status — will show "interrupted" at review gates
mcp__protolabs__get_content_status({ projectPath: "...", runId: "..." })

# Resume with approval
mcp__protolabs__review_content({
  projectPath: "...",
  runId: "...",
  gate: "research_hitl",
  decision: "approve"
})
```

**Important:** HITL mode requires a `MemorySaver` checkpointer (automatically added). `ChatAnthropic` instances aren't fully serializable by `MemorySaver`, so HITL mode may have limitations with checkpoint restoration.

## Troubleshooting

### Recursion Limit Exceeded

**Symptom:** Flow fails with `GraphRecursionError` or stops mid-execution.

**Cause:** The default LangGraph recursion limit of 25 is too low. With 4-7 sections × parallel nodes × subgraph nodes × retry loops, the flow easily hits 100+ node visits.

**Fix:** The `ContentFlowService` sets `recursionLimit: 150` automatically. If you're invoking the flow directly, ensure you pass it:

```typescript
const stream = await flow.stream(input, { recursionLimit: 150 });
```

### Stream Accumulation for Reducer Fields

**Symptom:** Array fields (`researchResults`, `sections`, `reviewFeedback`, `outputs`) appear incomplete or contain only the last node's output.

**Cause:** LangGraph stream deltas don't apply annotation reducers. Each delta contains only the new items from the latest node.

**Fix:** The service manually accumulates reducer fields:

```typescript
const REDUCER_FIELDS = new Set(['researchResults', 'sections', 'reviewFeedback', 'outputs']);
for (const [key, value] of Object.entries(nodeOutput)) {
  if (REDUCER_FIELDS.has(key) && Array.isArray(value)) {
    const existing = lastState[key];
    lastState[key] = Array.isArray(existing) ? [...existing, ...value] : value;
  } else {
    lastState[key] = value;
  }
}
```

### Output Files Not Written

**Symptom:** Flow completes but no `content.md` file exists in the output directory.

**Cause:** If the final review fails and routes to `complete` via the `failed` path, the output phase is skipped. The `assembledContent` exists in state but the `fan_out_output` → `output_delegate` nodes never run.

**Fix:** The service has a fallback: if `outputs` is empty but `assembledContent` exists, it writes the assembled content directly as `content.md`.

### No Langfuse Traces

**Symptom:** Content flows complete but no traces appear in Langfuse.

**Cause:** Missing `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` environment variables. The Langfuse singleton degrades gracefully — `isAvailable()` returns false and all tracing calls are no-ops.

**Fix:** Set the environment variables in your `.env` file:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # optional, this is the default
```

## Related Documentation

- [Flows Package](./flows.md) — LangGraph flow architecture and patterns
- [Observability Package](./observability-package.md) — Langfuse tracing and cost tracking
