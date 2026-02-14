# Antagonistic Review Pattern

A multi-perspective review pipeline combining **G-Eval chain-of-thought scoring**, **Constitutional AI critique-revision loops**, and **configurable dimension rubrics** to produce high-quality deliverables through adversarial review.

## Overview

The antagonistic review pattern orchestrates dual-perspective reviews where agents evaluate deliverables from different viewpoints (e.g., optimistic vs. critical, operational vs. strategic). The pattern resolves conflicting perspectives through a resolution agent that synthesizes feedback into actionable improvements.

### Key Characteristics

- **Multi-perspective evaluation**: Two or more agents review from different viewpoints
- **Chain-of-thought scoring**: Reviewers provide detailed reasoning before judgments (G-Eval)
- **Critique-revision loops**: Iterative refinement based on Constitutional AI principles
- **Configurable dimensions**: Custom evaluation rubrics for different deliverable types
- **Structured output**: XML/JSON format for machine-parseable results
- **LangGraph integration**: Drop-in nodes for any state graph workflow
- **Observability**: Full Langfuse tracing for review analytics

## Architecture

### High-Level Flow

```
Input Deliverable
    ↓
┌─────────────────────────────────┐
│   Parallel Review (Send())      │
│  ┌─────────┐      ┌──────────┐ │
│  │ Ava     │      │ Jon      │ │
│  │ Review  │      │ Review   │ │
│  └─────────┘      └──────────┘ │
└─────────────────────────────────┘
    ↓
Resolution Agent (Ava as CoS)
    ↓
Consolidated PRD / Deliverable
```

### Three-Stage Pipeline

1. **Stage 1: Primary Review** - First reviewer evaluates from their perspective
2. **Stage 2: Secondary Review** - Second reviewer evaluates with access to first review
3. **Stage 3: Resolution** - Resolution agent synthesizes both perspectives

### State Machine

```typescript
type ReviewState =
  | 'draft' // Deliverable being prepared
  | 'ava_review' // Primary review in progress
  | 'jon_review' // Secondary review in progress
  | 'resolution' // Resolving disagreements
  | 'consolidated'; // Final verdict reached

type ReviewVerdict = 'approve' | 'concern' | 'block';
```

## G-Eval Chain-of-Thought Scoring

The G-Eval approach (Liu et al., 2023) uses LLMs to evaluate quality through structured chain-of-thought reasoning before producing scores.

### Scoring Dimensions

Each reviewer evaluates deliverables across configurable dimensions:

```typescript
interface ReviewDimension {
  name: string; // e.g., "Technical Feasibility"
  description: string; // What this dimension measures
  weight: number; // Importance (0-1)
  criteria: string[]; // Evaluation criteria
  scale: { min: number; max: number; labels: Record<number, string> };
}
```

**Example PRD dimensions:**

- **Ava (Operational)**: Capacity (0.25), Technical Risk (0.30), Technical Debt (0.20), Feasibility (0.25)
- **Jon (Strategic)**: Customer Impact (0.35), ROI (0.20), Market Positioning (0.30), Priority (0.15)

### Chain-of-Thought Review Format

Reviewers follow a structured thinking process before scoring:

```markdown
## [Dimension Name]

### Chain-of-Thought Analysis

[Detailed reasoning about this dimension]

### Criteria Evaluation

- [Criterion 1]: [Met/Partially Met/Not Met] - [Explanation]
- [Criterion 2]: [Met/Partially Met/Not Met] - [Explanation]

### Score: [X/5]

**Rationale:** [Why this score was assigned]

### Concerns

- [Specific issue 1]
- [Specific issue 2]

### Recommendations

- [Actionable suggestion 1]
- [Actionable suggestion 2]
```

## Constitutional AI Critique-Revision Loop

Based on Anthropic's Constitutional AI (Bai et al., 2022), the pattern implements iterative refinement through critique and revision cycles.

### Constitutional Principles

Each reviewer operates under constitutional principles that guide evaluation:

**Ava's Operational Principles:**

- Protect team from overcommitment and burnout
- Ensure technical debt is acknowledged and managed
- Validate feasibility before commitment
- Prioritize sustainable execution over heroic efforts

**Jon's Strategic Principles:**

- Maximize customer value in every decision
- Maintain competitive advantage and market position
- Ensure ROI justifies investment
- Align with long-term strategic vision

### Critique-Revision Cycle

```
Initial PRD → Critique (Ava) → Revision (if needed) → Re-Review
           → Critique (Jon) → Final Resolution → Consolidated PRD
```

### Implementation Example

```typescript
import { AntagonisticReviewService } from '@automaker/server';

const reviewService = AntagonisticReviewService.getInstance(agentFactory, events);

const result = await reviewService.executeReview({
  prd: originalPRD,
  prdId: 'prd-123',
  projectPath: '/path/to/project',
});

if (result.success) {
  console.log('Ava:', result.avaReview.concerns);
  console.log('Jon:', result.jonReview.concerns);
  console.log('Final PRD:', result.finalPRD);
}
```

## Configurable Dimension Rubrics

Rubrics adapt to different deliverable types (PRDs, code, documentation, architecture).

### Rubric Schema

```typescript
interface ReviewRubric {
  deliverableType: string;
  dimensions: ReviewDimension[];
  passingThreshold: number; // Overall score needed to pass
  blockingThreshold: number; // Score below which review is blocked
  reviewerProfiles: {
    primary: ReviewerProfile;
    secondary: ReviewerProfile;
  };
}

interface ReviewerProfile {
  role: string;
  perspective: string;
  principles: string[];
  dimensions: ReviewDimension[];
}
```

### Example: Code Review Rubric

```typescript
const codeReviewRubric: ReviewRubric = {
  deliverableType: 'code',
  dimensions: [
    { name: 'Correctness', weight: 0.3, criteria: ['Logic correct', 'Edge cases handled'] },
    { name: 'Maintainability', weight: 0.25, criteria: ['Clear naming', 'Follows patterns'] },
    { name: 'Performance', weight: 0.2, criteria: ['No inefficiencies', 'Scales well'] },
    { name: 'Security', weight: 0.25, criteria: ['Input validation', 'No injection risks'] },
  ],
  passingThreshold: 3.5,
  blockingThreshold: 2.5,
  reviewerProfiles: {
    primary: { role: 'senior-engineer', perspective: 'technical-depth' },
    secondary: { role: 'security-engineer', perspective: 'security-first' },
  },
};
```

## LangGraph Integration

The antagonistic review pattern integrates seamlessly into any LangGraph workflow.

### As a Subgraph

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';
import { createAntagonisticReviewSubgraph } from '@automaker/flows';

const MainState = Annotation.Root({
  prd: Annotation<SPARCPrd>,
  reviewResult: Annotation<AntagonisticReviewResult | undefined>,
});

const graph = new StateGraph(MainState)
  .addNode('draft_prd', draftPRDNode)
  .addNode('antagonistic_review', createAntagonisticReviewSubgraph())
  .addNode('handle_result', handleResultNode)
  .addEdge('draft_prd', 'antagonistic_review')
  .addEdge('antagonistic_review', 'handle_result');
```

### With Send() for Parallel Reviews

```typescript
import { Send, Command } from '@langchain/langgraph';

async function fanOutReviews(state: ReviewState) {
  const sends = [
    new Send('ava_reviewer', { ...state, reviewerProfile: rubric.primary }),
    new Send('jon_reviewer', { ...state, reviewerProfile: rubric.secondary }),
  ];
  return new Command({ goto: sends });
}

const graph = new StateGraph(ReviewState)
  .addNode('fan_out', fanOutReviews)
  .addNode('ava_reviewer', avaReviewerNode)
  .addNode('jon_reviewer', jonReviewerNode)
  .addNode('aggregate', aggregateReviews)
  .addNode('resolution', resolutionNode)
  .addEdge('fan_out', 'aggregate')
  .addEdge('aggregate', 'resolution');
```

### With Human-in-the-Loop Interrupts

```typescript
const compiled = graph.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ['human_review_ava', 'human_review_jon'],
});

const threadId = { configurable: { thread_id: 'review-123' } };
await compiled.invoke({ prd: inputPRD }, threadId);

// At interrupt, human reviews and approves
await compiled.updateState(threadId, { avaApproved: true, avaFeedback: 'Proceed' });
await compiled.invoke(null, threadId); // Resume
```

## XML Output Format

Reviews produce structured XML output for machine parsing and downstream processing.

### Review Result Schema

```xml
<?xml version="1.0" encoding="UTF-8"?>
<antagonistic-review>
  <metadata>
    <review-id>review-abc123</review-id>
    <deliverable-type>prd</deliverable-type>
    <started-at>2026-02-14T10:00:00Z</started-at>
    <completed-at>2026-02-14T10:02:30Z</completed-at>
  </metadata>

  <primary-review>
    <reviewer>ava</reviewer>
    <perspective>operational</perspective>
    <overall-verdict>approve-with-conditions</overall-verdict>
    <overall-score>3.8</overall-score>

    <dimensions>
      <dimension>
        <name>Capacity</name>
        <score>4.0</score>
        <reasoning>Team has adequate resources. Timeline realistic.</reasoning>
        <concerns>
          <concern severity="warning">Q4 capacity overlap</concern>
        </concerns>
        <recommendations>
          <recommendation>Stagger implementation phases</recommendation>
        </recommendations>
      </dimension>
    </dimensions>
  </primary-review>

  <secondary-review>
    <reviewer>jon</reviewer>
    <perspective>strategic</perspective>
    <overall-verdict>approve</overall-verdict>
    <overall-score>4.2</overall-score>

    <dimensions>
      <dimension>
        <name>Customer Impact</name>
        <score>4.5</score>
        <reasoning>High customer value. Clear ROI path.</reasoning>
      </dimension>
    </dimensions>
  </secondary-review>

  <resolution>
    <consolidated-verdict>proceed-with-modifications</consolidated-verdict>
    <consolidated-score>4.0</consolidated-score>
    <rationale>Both positive. Address timeline concerns.</rationale>

    <required-modifications>
      <modification>Adjust timeline for Q4 capacity</modification>
      <modification>Add customer beta program</modification>
    </required-modifications>
  </resolution>
</antagonistic-review>
```

## Langfuse Tracing

Full observability via Langfuse integration for review analytics and debugging.

### Trace Structure

```typescript
import { withLangfuseTracing } from '@automaker/observability';

const tracedReview = withLangfuseTracing(
  async (prd: SPARCPrd) => {
    return await reviewService.executeReview({ prd, prdId: 'prd-123', projectPath: '/path' });
  },
  {
    traceName: 'antagonistic-review',
    metadata: { deliverableType: 'prd' },
  }
);
```

### Trace Hierarchy

```
antagonistic-review (root span)
├── ava-review (span)
│   ├── dimension-capacity
│   ├── dimension-risk
│   └── dimension-feasibility
├── jon-review (span)
│   ├── dimension-customer-impact
│   ├── dimension-roi
│   └── dimension-positioning
└── resolution (span)
    ├── synthesize-feedback
    └── generate-consolidated-prd
```

### Metrics Captured

- **Review duration**: Total time and per-stage timing
- **Dimension scores**: Individual dimension scores for analytics
- **Token usage**: LLM tokens consumed per review stage
- **Verdict distribution**: Approve/concern/block rates over time
- **Revision cycles**: Number of critique-revision iterations
- **Reviewer agreement**: Correlation between Ava and Jon scores

### Analytics Queries

Query review metrics from Langfuse:

- **Average duration**: `getTraceMetrics({ traceName: 'antagonistic-review', metric: 'duration' })`
- **Dimension scores**: `getObservations({ spanName: 'dimension-capacity', outputKey: 'score' })`
- **Reviewer agreement**: Custom SQL correlating Ava/Jon scores across traces

## Examples

### PRD Review

```typescript
import { AntagonisticReviewService } from '@automaker/server';

const service = AntagonisticReviewService.getInstance(agentFactory, events);
const result = await service.executeReview({
  prd: { situation: '...', problem: '...', approach: '...', results: '...' },
  prdId: 'onboarding-redesign',
  projectPath: '/path/to/project',
});

console.log('Ava verdict:', result.avaReview.verdict);
console.log('Jon verdict:', result.jonReview.verdict);
console.log('Final PRD:', result.finalPRD);
```

### Code Review

```typescript
import { createCodeReviewFlow } from '@automaker/flows';

const result = await createCodeReviewFlow({ rubric: codeReviewRubric }).invoke({
  code: sourceCode,
  language: 'typescript',
  context: { fileName: 'feature.ts', prNumber: 123 },
});

const security = result.secondaryReview.dimensions.find((d) => d.name === 'Security');
if (security?.concerns.length > 0) {
  console.warn('Security concerns:', security.concerns);
}
```

### Documentation Review with HITL

```typescript
const flow = createDocReviewFlow({
  rubric: docRubric,
  interruptBefore: ['human-review'],
});

const threadId = { configurable: { thread_id: 'doc-456' } };
await flow.invoke({ document: content, docType: 'technical-guide' }, threadId);

// At interrupt
const state = await flow.getState(threadId);
console.log('Ava concerns:', state.values.avaReview.concerns);

// Approve and resume
await flow.updateState(threadId, { humanApproved: true });
await flow.invoke(null, threadId);
```

## Related Patterns

### STORM (Stanford, 2024)

Multi-perspective article generation through simulated expert conversations.

**Similarities:**

- Multi-perspective approach with different viewpoints
- Iterative refinement: Outline → Draft → Review
- Expert simulation via role-based agents

**Differences:**

- STORM generates content, antagonistic review evaluates quality
- STORM uses retrieval augmentation, we use constitutional principles
- STORM produces articles, we produce quality verdicts

### CrewAI

Multi-agent orchestration with hierarchical or sequential task delegation.

**Similarities:**

- Multi-agent coordination
- Role-based specialized agents
- Task delegation patterns

**Differences:**

- CrewAI is task-oriented, we are evaluation-oriented
- CrewAI supports many workflows, we are review-specific
- CrewAI has hierarchical management, we have peer review

### LangGraph Reflection Agents

Self-critique loops for iterative improvement.

**Similarities:**

- Critique-revision loops
- Conditional routing for revisions
- State persistence across iterations

**Differences:**

- Reflection is single-agent, we are multi-agent
- Reflection critiques own output, we use external perspectives
- Reflection loops until satisfied, we synthesize disagreement

### Constitutional AI (Anthropic, 2022)

Training models through critique and revision against constitutional principles.

**Similarities:**

- Principle-based evaluation
- Critique-revision cycles
- Balance competing objectives

**Differences:**

- CAI trains models, we evaluate deliverables
- CAI uses self-critique, we use adversarial agents
- CAI focuses on alignment, we focus on quality

## Best Practices

### Choosing Reviewers

- **Complementary perspectives**: Select reviewers with genuinely different concerns
- **Domain expertise**: Match reviewer profiles to deliverable type
- **Constitutional alignment**: Ensure reviewer principles align with org values

### Configuring Dimensions

- **Keep it focused**: 4-6 dimensions per reviewer is optimal
- **Weight appropriately**: Critical dimensions should have higher weights
- **Clear criteria**: Each dimension needs 3-5 concrete evaluation criteria
- **Calibrate scales**: Use 5-point scales for balance between granularity and usability

### Managing Revision Cycles

- **Set iteration limits**: 2-3 revision cycles maximum to avoid perfectionism
- **Track revision history**: Log all critique-revision pairs for learning
- **Escalate deadlocks**: If reviewers fundamentally disagree after 2 cycles, escalate to human

### Observability

- **Always trace reviews**: Enable Langfuse tracing for all review executions
- **Monitor agreement rates**: Track reviewer correlation to calibrate rubrics
- **Analyze dimension trends**: Use score trends to identify systematic issues
- **Review token costs**: Monitor LLM usage to optimize prompt efficiency

## Integration Example

Complete example integrating all components:

```typescript
import { AntagonisticReviewService } from '@automaker/server';
import { withLangfuseTracing } from '@automaker/observability';
import { StateGraph, MemorySaver } from '@langchain/langgraph';

// Define review rubric
const prdRubric: ReviewRubric = {
  deliverableType: 'prd',
  dimensions: [
    { name: 'Capacity', weight: 0.25, criteria: ['Team has skills', 'Timeline realistic'] },
    { name: 'Risk', weight: 0.3, criteria: ['Dependencies stable', 'Architecture sound'] },
    { name: 'Impact', weight: 0.35, criteria: ['Customer value', 'Clear ROI'] },
  ],
  passingThreshold: 3.5,
  blockingThreshold: 2.5,
  reviewerProfiles: {
    primary: { role: 'ava', perspective: 'operational' },
    secondary: { role: 'jon', perspective: 'strategic' },
  },
};

// Create traced review service
const reviewService = AntagonisticReviewService.getInstance(agentFactory, events);

const tracedReview = withLangfuseTracing(
  async (prd: SPARCPrd) => {
    return await reviewService.executeReview({
      prd,
      prdId: `prd-${Date.now()}`,
      projectPath: '/path/to/project',
    });
  },
  { traceName: 'antagonistic-review', metadata: { rubric: 'prd-v1' } }
);

// Integrate into LangGraph flow
const graph = new StateGraph(ProjectState)
  .addNode('draft_prd', draftNode)
  .addNode('review', async (state) => {
    const result = await tracedReview(state.prd);
    return { reviewResult: result };
  })
  .addNode('handle_result', handleResultNode)
  .addEdge('draft_prd', 'review')
  .addConditionalEdges('review', (state) => {
    return state.reviewResult.success ? 'handle_result' : 'draft_prd';
  });

const compiled = graph.compile({ checkpointer: new MemorySaver() });

// Execute
const result = await compiled.invoke({
  prd: inputPRD,
});

console.log('Review completed:', result.reviewResult);
```

## Next Steps

- **[Content Pipeline](./content-pipeline.md)** — Multi-phase content generation with HITL gates
- **[Flows Package](./flows.md)** — LangGraph flow primitives and utilities
- **[Observability Package](./observability-package.md)** — Langfuse tracing and prompt management
