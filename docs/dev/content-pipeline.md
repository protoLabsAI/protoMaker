# Content Creation Pipeline

Comprehensive guide to the content generation pipeline at `libs/flows/src/content/`. This pipeline transforms research into multi-format content (blog posts, technical docs, training examples, HuggingFace datasets) using a 7-phase flow with human oversight gates, parallel processing, and Langfuse tracing.

## Architecture Overview

The content creation flow follows a **7-phase pipeline** with 3 HITL (Human-in-the-Loop) interrupt gates:

```
Research(parallel) → HITL → Outline → HITL → Generation(parallel) → Assembly → Review(parallel) → HITL → Output(parallel)
```

### Phase Breakdown

| Phase         | Parallelism | HITL Gate        | Purpose                                                         |
| ------------- | ----------- | ---------------- | --------------------------------------------------------------- |
| 1. Research   | ✓ Send()    | ✓ After research | Generate research queries, fan out to parallel research workers |
| 2. Outline    | -           | ✓ After outline  | Generate content outline from research findings                 |
| 3. Generation | ✓ Send()    | -                | Fan out to parallel SectionWriter subgraphs                     |
| 4. Assembly   | -           | -                | Combine sections into cohesive document                         |
| 5. Review     | ✓ Send()    | ✓ After review   | Fan out to parallel section reviewers                           |
| 6. Output     | ✓ Send()    | -                | Generate multiple output formats (markdown, html, pdf)          |
| 7. Complete   | -           | -                | Finalize metadata and close trace                               |

### Send() Parallelism Points

The pipeline uses LangGraph's `Send()` primitive for parallel execution at 4 points:

```typescript
// Phase 1: Research - multiple queries in parallel
for (const query of researchQueries) {
  sends.push(new Send('research_delegate', { ...state, query }));
}

// Phase 3: Generation - multiple sections in parallel
for (const section of outline.sections) {
  sends.push(new Send('generation_delegate', { ...state, sectionSpec: section }));
}

// Phase 5: Review - multiple section reviews in parallel
for (const section of sections) {
  sends.push(new Send('review_delegate', { ...state, section }));
}

// Phase 6: Output - multiple formats in parallel
for (const format of config.outputFormats) {
  sends.push(new Send('output_delegate', { ...state, outputFormat: format }));
}
```

### HITL Interrupt Gates

Three interrupt points allow human review and revision:

```typescript
graph.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: [
    'research_hitl', // Approve/revise research findings
    'outline_hitl', // Approve/revise content outline
    'final_review_hitl', // Approve/revise assembled content
  ],
});
```

**Resumption after HITL:**

```typescript
// User updates state with approval decision
await graph.updateState(threadId, {
  researchApproved: true,
  researchFeedback: undefined,
});

// Resume from interrupt
await graph.invoke(null, { threadId });
```

## Content Types

The pipeline produces 4 content types, each with a discriminated schema:

### BlogPost

Structured blog post with frontmatter, sections, and SEO metadata.

```typescript
import { BlogPostSchema, type BlogPost } from '@automaker/types';

const blogPost: BlogPost = {
  type: 'blog-post', // Discriminator
  title: 'Complete Guide to LangGraph Flows',
  slug: 'complete-guide-langgraph-flows',
  frontmatter: {
    author: 'AutoMaker',
    publishedAt: '2026-02-14T00:00:00Z',
    category: 'Tutorials',
    tags: ['langgraph', 'ai', 'workflows'],
    readingTime: 12,
  },
  sections: [
    {
      heading: 'Introduction',
      content: 'LangGraph flows enable...',
      level: 2,
      id: 'introduction',
    },
    // ... more sections
  ],
  seoMetadata: {
    description: 'Learn how to build production-ready LangGraph flows...',
    keywords: ['langgraph', 'ai workflows', 'state graphs'],
    canonicalUrl: 'https://example.com/blog/complete-guide-langgraph-flows',
  },
  excerpt: 'LangGraph flows enable building complex AI workflows...',
};
```

### TechDoc

Technical documentation with code examples and API references.

```typescript
import { TechDocSchema, type TechDoc } from '@automaker/types';

const techDoc: TechDoc = {
  type: 'tech-doc',
  title: 'Content Pipeline API Reference',
  sections: [
    {
      heading: 'createContentCreationFlow()',
      content: 'Creates a compiled LangGraph flow...',
      level: 2,
      id: 'create-flow',
    },
  ],
  codeExamples: [
    {
      language: 'typescript',
      code: 'const flow = createContentCreationFlow({ checkpointer });',
      description: 'Basic flow creation',
      filename: 'example.ts',
    },
  ],
  apiReferences: [
    {
      name: 'createContentCreationFlow',
      signature: '(config?: { checkpointer?: MemorySaver }) => CompiledGraph',
      description: 'Creates and compiles the content creation graph',
      parameters: [
        {
          name: 'config',
          type: '{ checkpointer?: MemorySaver }',
          description: 'Optional configuration',
          optional: true,
        },
      ],
      returns: {
        type: 'CompiledGraph',
        description: 'Compiled LangGraph flow ready for invocation',
      },
    },
  ],
  category: 'API Reference',
  tags: ['flows', 'content', 'api'],
};
```

### TrainingExample

Input/output pairs for fine-tuning models.

````typescript
import { TrainingExampleSchema, type TrainingExample } from '@automaker/types';

const example: TrainingExample = {
  type: 'training-example',
  input: 'How do I create a LangGraph flow with parallel execution?',
  output:
    'Use Send() to fan out to multiple parallel nodes:\n\n```typescript\nconst sends = sections.map(s => new Send("worker", { ...state, section: s }));\nreturn new Command({ goto: sends });\n```',
  metadata: {
    source: 'generated',
    quality: 0.95,
    difficulty: 'intermediate',
    domain: 'langgraph',
    createdAt: '2026-02-14T10:00:00Z',
    createdBy: 'automaker-flow',
  },
  tags: ['langgraph', 'parallel', 'send'],
};
````

### HFDatasetRow

HuggingFace dataset format with chat messages.

````typescript
import { HFDatasetRowSchema, type HFDatasetRow } from '@automaker/types';

const row: HFDatasetRow = {
  type: 'hf-dataset-row',
  messages: [
    {
      role: 'system',
      content: 'You are an expert in LangGraph workflows.',
    },
    {
      role: 'user',
      content: 'How do I add HITL interrupts to my flow?',
    },
    {
      role: 'assistant',
      content:
        'Use the interruptBefore option when compiling:\n\n```typescript\ngraph.compile({ checkpointer, interruptBefore: ["review_node"] });\n```',
    },
  ],
  metadata: {
    source: 'generated',
    quality: 0.92,
    difficulty: 'advanced',
    domain: 'langgraph',
  },
};
````

## ContentConfig Reference

The `ContentConfig` interface controls flow behavior and output formatting:

```typescript
export interface ContentConfig {
  // Core config
  topic: string; // Content topic/subject
  format: 'tutorial' | 'reference' | 'guide'; // Content format
  tone: 'technical' | 'conversational' | 'formal'; // Writing tone
  audience: 'beginner' | 'intermediate' | 'expert'; // Target audience
  outputFormats: Array<'markdown' | 'html' | 'pdf'>; // Output formats

  // Models
  smartModel: BaseChatModel; // Smart model (Opus/Sonnet)
  fastModel: BaseChatModel; // Fast model (Haiku)

  // Tracing
  langfuseClient?: LangfuseClient; // Optional Langfuse tracing

  // Blog-specific config (future)
  length?: 'short' | 'standard' | 'long-form'; // Word count target
  blogTemplate?: 'evergreen-guide' | 'tutorial' | 'affiliate-review' | 'list-post'; // Blog template
  revenueGoal?: 'informational' | 'transactional' | 'affiliate'; // Monetization strategy
  ctaConfig?: CTAConfig; // Call-to-action strategy
  seoConfig?: SEOConfig; // SEO optimization config
  abTestConfig?: ABTestConfig; // A/B testing config
}
```

### Length Targets

Word count recommendations by length:

| Length      | Word Count | Use Case                                       |
| ----------- | ---------- | ---------------------------------------------- |
| `short`     | 500-800    | Quick updates, announcements, list posts       |
| `standard`  | 1200-1800  | Tutorials, how-to guides, product reviews      |
| `long-form` | 2500-4000+ | Comprehensive guides, pillar content, research |

### Blog Templates

Available templates with use cases:

| Template           | Description                      | Example                                            |
| ------------------ | -------------------------------- | -------------------------------------------------- |
| `evergreen-guide`  | Timeless, comprehensive resource | "Complete Guide to TypeScript Decorators"          |
| `tutorial`         | Step-by-step walkthrough         | "Building a RAG Pipeline in 10 Minutes"            |
| `affiliate-review` | Product comparison with CTAs     | "Best LLM Providers for Production: 2026 Review"   |
| `list-post`        | Numbered/bulleted listicle       | "7 LangGraph Patterns Every Developer Should Know" |

### SEO Configuration

```typescript
export interface SEOConfig {
  primaryKeyword: string; // Target keyword
  secondaryKeywords?: string[]; // Supporting keywords
  targetSerpPosition?: number; // SERP goal (default: top 10)
  internalLinks?: {
    anchor: string;
    url: string;
    context: string; // Where to insert
  }[];
  externalAuthority?: {
    // High-authority sources to link
    domain: string;
    minRelevanceScore: number; // 0-1
  }[];
}
```

**Example:**

```typescript
const seoConfig: SEOConfig = {
  primaryKeyword: 'langgraph tutorial',
  secondaryKeywords: ['state graph', 'ai workflows', 'langchain'],
  targetSerpPosition: 3,
  internalLinks: [
    {
      anchor: 'flows documentation',
      url: '/docs/dev/flows',
      context: 'intro', // Insert in introduction section
    },
  ],
  externalAuthority: [
    {
      domain: 'langchain.com',
      minRelevanceScore: 0.8,
    },
  ],
};
```

### CTA Configuration

```typescript
export interface CTAConfig {
  type: 'subscribe' | 'download' | 'purchase' | 'contact';
  placement: 'inline' | 'end' | 'both';
  message: string; // CTA copy
  buttonText: string; // Button label
  urgency?: boolean; // Add urgency language
  personalization?: {
    // Personalize by audience
    beginner?: string;
    intermediate?: string;
    expert?: string;
  };
}
```

**Example:**

```typescript
const ctaConfig: CTAConfig = {
  type: 'subscribe',
  placement: 'both',
  message: 'Want more LangGraph tips delivered weekly?',
  buttonText: 'Join 5,000+ Developers',
  urgency: true,
  personalization: {
    beginner: 'Start your LangGraph journey with our beginner-friendly newsletter',
    expert: 'Get advanced LangGraph patterns and architecture insights',
  },
};
```

### A/B Testing Configuration

```typescript
export interface ABTestConfig {
  variantId: string; // Unique variant identifier
  experimentName: string; // Experiment name (groups variants)
  promptVersions?: {
    // Prompt variants
    outline?: string; // Langfuse prompt name
    generation?: string;
    review?: string;
  };
  trackingMetadata: {
    // Custom tracking data
    [key: string]: unknown;
  };
}
```

## Blog Writing Strategy

The pipeline implements a **comprehensive blog optimization strategy** based on proven content marketing techniques.

### Antagonistic Review Scoring

The review phase uses an **8-dimension scoring system** to evaluate content quality:

```typescript
interface ReviewScores {
  hook: number; // 0-10: Hook strength (first 100 words)
  clarity: number; // 0-10: Readability and comprehension
  value: number; // 0-10: Actionable insights density
  engagement: number; // 0-10: Scanability and visual hierarchy
  seo: number; // 0-10: Keyword integration and optimization
  credibility: number; // 0-10: Authority signals and citations
  cta: number; // 0-10: CTA effectiveness and placement
  completion: number; // 0-10: Satisfies user intent fully
}
```

**Scoring thresholds:**

- **9-10**: Exceptional, publish-ready
- **7-8**: Good, minor revisions
- **5-6**: Needs improvement, major revisions
- **0-4**: Fails quality bar, regenerate

**Antagonistic review principle:** The reviewer is intentionally critical and looks for weaknesses. This ensures only high-quality content passes the gate.

### Headline Formulas

The outline generator selects from proven headline templates:

| Formula        | Template                                             | Example                                            |
| -------------- | ---------------------------------------------------- | -------------------------------------------------- |
| How-To         | "How to [Achieve Outcome] in [Timeframe]"            | "How to Build RAG Pipelines in 30 Minutes"         |
| Ultimate Guide | "The Complete Guide to [Topic]"                      | "The Complete Guide to LangGraph State Management" |
| Numbered List  | "[Number] [Adjective] Ways to [Outcome]"             | "7 Proven Ways to Optimize LLM Costs"              |
| Vs Comparison  | "[Option A] vs [Option B]: Which Should You Choose?" | "Sonnet vs Opus: Which Model for Production?"      |
| Secret/Insider | "The [Number] Secrets of [Outcome]"                  | "The 3 Secrets of 10x Developer Productivity"      |

### Hook Patterns

The first 100 words (the "hook") follow proven patterns:

1. **Problem-Agitate-Solution (PAS)**

   ```
   [Problem]: You're spending hours debugging LangGraph flows.
   [Agitate]: Every state update feels like a mystery, and error messages are cryptic.
   [Solution]: This guide shows you the exact debugging patterns that cut debugging time by 80%.
   ```

2. **Story Opening**

   ```
   Last week, our production LangGraph flow went down at 3am. The error? "State reducer conflict."
   After 6 hours of debugging, I discovered a single line that changed everything...
   ```

3. **Surprising Statistic**

   ```
   87% of LangGraph developers make this one mistake in their first flow.
   I know because I analyzed 500+ production flows. Here's what I found...
   ```

4. **Authority Statement**
   ```
   After building 50+ production LangGraph flows for Fortune 500 companies,
   I've learned the patterns that separate amateur flows from production-ready systems...
   ```

### F-Pattern Scanning

Content is structured for **F-pattern reading** (how users scan web content):

```
Strong headline                          ← High attention
Compelling first sentence...             ← High attention
Second sentence continues...             ← Medium attention

## Subheading Grabs Attention           ← High attention
First few words of paragraph...         ← High attention
...rest of paragraph gets less attention ← Low attention

Key insight called out in **bold**      ← Medium attention
```

**Implementation:**

- **Frontload value** in headlines, first sentences, and list items
- **Bold key phrases** to guide scanning
- **Use subheadings every 200-300 words**
- **Lead with benefit, not feature**: "Cut debugging time 80%" not "Advanced debugging tools"

### Bucket Brigade Transitions

**Bucket brigades** are transition phrases that pull readers to the next section:

| Position            | Bucket Brigade                          |
| ------------------- | --------------------------------------- |
| End of intro        | "Here's what you need to know:"         |
| Before code example | "Let me show you exactly how:"          |
| After explanation   | "But there's a catch:"                  |
| Before list         | "This breaks down into 3 parts:"        |
| Section transition  | "Now here's where it gets interesting:" |
| Before CTA          | "Ready to put this into practice?"      |

**Effect:** Reduces bounce rate by creating "open loops" that demand closure.

### SEO Checklist

The review phase validates SEO optimization:

- [ ] **Primary keyword** in H1 title
- [ ] **Primary keyword** in first 100 words
- [ ] **Secondary keywords** distributed naturally (1 per 300 words)
- [ ] **Keyword in H2 subheadings** (at least 2)
- [ ] **Internal links** to related content (3-5 links)
- [ ] **External authority links** to high-trust sources (2-3 links)
- [ ] **Meta description** 150-160 characters with primary keyword
- [ ] **Image alt text** with descriptive keywords
- [ ] **URL slug** is concise and keyword-rich

**Keyword density target:** 1-2% (avoid keyword stuffing)

## A/B Testing

The pipeline supports **prompt variant experiments** using Langfuse prompt versioning.

### Setting Up A/B Tests

1. **Create prompt variants in Langfuse:**

```typescript
// Variant A: Standard outline prompt
langfuse.createPrompt({
  name: 'outline-generator-v1',
  prompt: 'Generate a technical outline for {topic}...',
  version: 1,
});

// Variant B: SEO-optimized outline prompt
langfuse.createPrompt({
  name: 'outline-generator-v1',
  prompt: 'Generate an SEO-optimized outline for {topic} targeting keyword {keyword}...',
  version: 2,
});
```

2. **Configure A/B test in ContentConfig:**

```typescript
const configA: ContentConfig = {
  topic: 'LangGraph Debugging',
  format: 'tutorial',
  // ... other config
  abTestConfig: {
    variantId: 'variant-a',
    experimentName: 'outline-seo-optimization',
    promptVersions: {
      outline: 'outline-generator-v1@1', // Version 1
    },
    trackingMetadata: {
      hypothesis: 'Standard outline performs better for tutorials',
    },
  },
};

const configB: ContentConfig = {
  topic: 'LangGraph Debugging',
  format: 'tutorial',
  // ... other config
  abTestConfig: {
    variantId: 'variant-b',
    experimentName: 'outline-seo-optimization',
    promptVersions: {
      outline: 'outline-generator-v1@2', // Version 2
    },
    trackingMetadata: {
      hypothesis: 'SEO-optimized outline increases organic traffic',
    },
  },
};
```

3. **Run variants in parallel:**

```typescript
const [resultA, resultB] = await Promise.all([
  flow.invoke({ config: configA }, { threadId: 'test-a' }),
  flow.invoke({ config: configB }, { threadId: 'test-b' }),
]);
```

4. **Analyze results in Langfuse:**

Navigate to the experiment in Langfuse dashboard:

- Compare cost/latency between variants
- Review generated outputs side-by-side
- Track downstream metrics (engagement, conversions)

### A/B Testing Best Practices

- **Single variable**: Test one change at a time (prompt, model, temperature)
- **Statistical significance**: Run 20+ samples per variant
- **Consistent input**: Use identical research/context for fair comparison
- **Track metadata**: Log hypothesis and experiment goals
- **Cost awareness**: Use fast models for high-volume experiments

## Usage Examples

### 1. Quick Marketing Post (Short, Fast)

```typescript
import { createContentCreationFlow } from '@automaker/flows';
import { FakeChatModel } from '@langchain/core/utils/testing';

const flow = createContentCreationFlow();

const result = await flow.invoke({
  config: {
    topic: 'New AutoMaker v2.0 Release',
    format: 'guide',
    tone: 'conversational',
    audience: 'intermediate',
    outputFormats: ['markdown', 'html'],
    length: 'short',
    blogTemplate: 'list-post',
    smartModel: new FakeChatModel({ responses: ['...'] }),
    fastModel: new FakeChatModel({ responses: ['...'] }),
  },
});

// Skip HITL interrupts for automated generation
await flow.updateState(result.threadId, { researchApproved: true });
await flow.updateState(result.threadId, { outlineApproved: true });
await flow.updateState(result.threadId, { reviewApproved: true });

const finalState = await flow.invoke(null, { threadId: result.threadId });
console.log(finalState.outputs); // markdown + html
```

### 2. Long-Form Evergreen Guide (Comprehensive, SEO-Optimized)

```typescript
const flow = createContentCreationFlow();

const result = await flow.invoke({
  config: {
    topic: 'Complete Guide to Production LangGraph Flows',
    format: 'guide',
    tone: 'technical',
    audience: 'expert',
    outputFormats: ['markdown', 'pdf'],
    length: 'long-form',
    blogTemplate: 'evergreen-guide',
    smartModel: opusModel, // Use Opus for complex content
    fastModel: haikuModel,
    langfuseClient,
    seoConfig: {
      primaryKeyword: 'langgraph production guide',
      secondaryKeywords: ['state graphs', 'ai workflows', 'hitl patterns'],
      targetSerpPosition: 3,
    },
    ctaConfig: {
      type: 'download',
      placement: 'both',
      message: 'Download the complete LangGraph production checklist',
      buttonText: 'Get Free Checklist',
      urgency: true,
    },
  },
});

// Human review at each HITL gate
// (Flow will interrupt automatically)
```

### 3. Tutorial with Code Examples

```typescript
const flow = createContentCreationFlow();

const result = await flow.invoke({
  config: {
    topic: 'Building RAG Pipelines with LangGraph',
    format: 'tutorial',
    tone: 'conversational',
    audience: 'beginner',
    outputFormats: ['markdown'],
    length: 'standard',
    blogTemplate: 'tutorial',
    smartModel: sonnetModel,
    fastModel: haikuModel,
    langfuseClient,
  },
});

// Review outline and approve
const state = await flow.getState(result.threadId);
console.log('Outline:', state.outline);

await flow.updateState(result.threadId, {
  outlineApproved: true,
  outlineFeedback: 'Add a troubleshooting section at the end',
});

const final = await flow.invoke(null, { threadId: result.threadId });
```

### 4. Affiliate Product Review

```typescript
const flow = createContentCreationFlow();

const result = await flow.invoke({
  config: {
    topic: 'Best LLM Providers for Production: 2026 Comparison',
    format: 'guide',
    tone: 'conversational',
    audience: 'intermediate',
    outputFormats: ['markdown', 'html'],
    length: 'long-form',
    blogTemplate: 'affiliate-review',
    revenueGoal: 'affiliate',
    smartModel: sonnetModel,
    fastModel: haikuModel,
    ctaConfig: {
      type: 'purchase',
      placement: 'inline',
      message: 'Ready to upgrade your LLM infrastructure?',
      buttonText: 'Start Free Trial',
      urgency: true,
      personalization: {
        beginner: 'Start with our recommended beginner-friendly provider',
        expert: 'Get enterprise-grade features with 99.9% uptime',
      },
    },
    seoConfig: {
      primaryKeyword: 'best llm providers 2026',
      secondaryKeywords: ['ai api comparison', 'production llm'],
    },
  },
});
```

## Prompt Templates

All prompts are managed via Langfuse for versioning and A/B testing.

### Prompt Template List

| Template                   | Purpose                                | Variables                                                    | Model Tier |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------ | ---------- |
| `research-query-generator` | Generate research queries from topic   | `{topic}`, `{format}`, `{audience}`                          | Fast       |
| `research-worker`          | Execute single research query          | `{query}`, `{context}`                                       | Smart      |
| `outline-generator`        | Generate content outline from research | `{topic}`, `{research}`, `{format}`, `{tone}`, `{audience}`  | Smart      |
| `section-writer`           | Generate single content section        | `{section}`, `{research}`, `{style}`, `{tone}`, `{audience}` | Smart      |
| `section-reviewer`         | Review section quality                 | `{section}`, `{criteria}`                                    | Fast       |
| `antagonistic-reviewer`    | Critical 8-dimension review            | `{content}`, `{seoConfig}`, `{ctaConfig}`                    | Smart      |
| `output-formatter-html`    | Convert markdown to HTML               | `{markdown}`                                                 | Fast       |
| `output-formatter-pdf`     | Convert markdown to PDF-ready format   | `{markdown}`                                                 | Fast       |

### Customizing Prompts

**Option 1: Langfuse UI**

1. Navigate to https://cloud.langfuse.com/prompts
2. Create new prompt or edit existing
3. Set variables and version
4. Reference in `abTestConfig.promptVersions`

**Option 2: Local Override**

```typescript
// Override prompts locally without Langfuse
const customPrompts = {
  'section-writer': `
You are an expert technical writer.

Section: {sectionTitle}
Description: {sectionDescription}
Research: {researchFindings}

Write {targetLength} words in {tone} tone for {audience} audience.
Include code examples if requested.

Output format:
<section>
  <title>Section Title</title>
  <content>
    Section content here...
  </content>
  <code_examples>
    <example language="typescript">
      <code>...</code>
      <explanation>...</explanation>
    </example>
  </code_examples>
</section>
`,
};

const flow = createContentCreationFlow({
  customPrompts,
});
```

## Tracing with Langfuse

The pipeline integrates Langfuse for tracing, cost tracking, and prompt versioning.

### Enabling Tracing

```typescript
import { LangfuseClient } from '@automaker/observability';

const langfuseClient = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: 'https://cloud.langfuse.com',
});

const flow = createContentCreationFlow();

const result = await flow.invoke({
  config: {
    // ... other config
    langfuseClient,
  },
});

// Trace ID is stored in state
console.log('Trace ID:', result.traceId);
console.log('View trace:', `https://cloud.langfuse.com/trace/${result.traceId}`);
```

### Trace Hierarchy

```
Trace: content-creation-flow-{timestamp}
├── Span: research-phase
│   ├── Generation: research-query-generator (fast-model)
│   ├── Generation: research-worker-1 (smart-model)
│   ├── Generation: research-worker-2 (smart-model)
│   └── Generation: research-worker-3 (smart-model)
├── Span: outline-phase
│   └── Generation: outline-generator (smart-model)
├── Span: generation-phase
│   ├── Span: section-1
│   │   └── Generation: section-writer (smart-model)
│   ├── Span: section-2
│   │   └── Generation: section-writer (smart-model)
│   └── Span: section-3
│       └── Generation: section-writer (smart-model)
├── Span: review-phase
│   ├── Generation: section-reviewer-1 (fast-model)
│   ├── Generation: section-reviewer-2 (fast-model)
│   └── Generation: antagonistic-reviewer (smart-model)
└── Span: output-phase
    ├── Generation: output-formatter-html (fast-model)
    └── Generation: output-formatter-pdf (fast-model)
```

### Cost Tracking

Langfuse automatically tracks cost per generation based on token usage:

```typescript
// View cost breakdown in Langfuse dashboard
// Or query via API
const trace = await langfuseClient.getTrace(traceId);
console.log('Total cost:', trace.calculatedTotalCost);
console.log('Token usage:', trace.calculatedTotalTokens);

// Per-phase cost breakdown
trace.observations.forEach((obs) => {
  console.log(`${obs.name}: $${obs.calculatedTotalCost}`);
});
```

### Metadata Captured

Each generation includes rich metadata:

```typescript
{
  // Phase metadata
  phase: 'generation',
  nodeId: 'section-writer',

  // Section metadata (for generation phase)
  sectionId: 'introduction',
  sectionTitle: 'Getting Started with LangGraph',

  // Model metadata
  modelTier: 'smart', // or 'fast'
  modelName: 'claude-sonnet-4-5-20250929',

  // Retry metadata
  retryCount: 0,
  validationError: null,

  // Config metadata
  audience: 'beginner',
  tone: 'conversational',
  format: 'tutorial',

  // A/B test metadata (if configured)
  variantId: 'variant-a',
  experimentName: 'section-writer-optimization',
}
```

## Testing

The pipeline is designed for easy testing with `FakeChatModel` and mock data.

### Testing with FakeChatModel

```typescript
import { FakeChatModel } from '@langchain/core/utils/testing';
import { createContentCreationFlow } from '@automaker/flows';

describe('Content Creation Flow', () => {
  it('should generate content end-to-end', async () => {
    // Mock models with predefined responses
    const smartModel = new FakeChatModel({
      responses: [
        // Research worker responses
        'Research finding 1 for query 1',
        'Research finding 2 for query 2',
        // Outline generator response
        '<outline><title>Test Guide</title><sections>...</sections></outline>',
        // Section writer responses
        '<section><title>Intro</title><content>Introduction content</content></section>',
        '<section><title>Main</title><content>Main content</content></section>',
        // Antagonistic reviewer response
        '<review><scores><hook>8</hook><clarity>9</clarity>...</scores></review>',
      ],
    });

    const fastModel = new FakeChatModel({
      responses: [
        // Query generator response
        'Query 1, Query 2',
        // Section reviewers
        '<feedback approved="true" />',
        '<feedback approved="true" />',
        // Output formatters
        '<html>...</html>',
      ],
    });

    const flow = createContentCreationFlow();

    const result = await flow.invoke({
      config: {
        topic: 'Test Topic',
        format: 'tutorial',
        tone: 'technical',
        audience: 'beginner',
        outputFormats: ['markdown', 'html'],
        smartModel,
        fastModel,
      },
    });

    // Auto-approve all HITL gates
    await flow.updateState(result.threadId, { researchApproved: true });
    await flow.updateState(result.threadId, { outlineApproved: true });
    await flow.updateState(result.threadId, { reviewApproved: true });

    const finalState = await flow.invoke(null, { threadId: result.threadId });

    expect(finalState.outputs).toHaveLength(2);
    expect(finalState.outputs[0].format).toBe('markdown');
    expect(finalState.outputs[1].format).toBe('html');
  });
});
```

### Mock Data Patterns

**Mock Research Findings:**

```typescript
const mockResearch: ResearchFindings = {
  facts: [
    'LangGraph uses state graphs for workflow orchestration',
    'Send() enables parallel execution of multiple nodes',
    'MemorySaver checkpointer enables HITL interrupts',
  ],
  examples: [
    'graph.compile({ checkpointer: new MemorySaver() })',
    'new Send("worker_node", { ...state, item })',
  ],
  references: ['https://langchain.com/langgraph', 'https://docs.langchain.com/state-graphs'],
};
```

**Mock Outline:**

```typescript
const mockOutline: Outline = {
  title: 'Complete Guide to LangGraph State Graphs',
  sections: [
    {
      id: 'intro',
      title: 'Introduction to State Graphs',
      description: 'Overview of state graph concepts',
      includeCodeExamples: false,
      targetLength: 200,
    },
    {
      id: 'parallel',
      title: 'Parallel Execution with Send()',
      description: 'How to fan out to multiple nodes',
      includeCodeExamples: true,
      targetLength: 500,
    },
  ],
};
```

**Mock Section:**

```typescript
const mockSection: ContentSection = {
  id: 'intro',
  title: 'Introduction to State Graphs',
  content: 'State graphs in LangGraph provide a structured way to orchestrate AI workflows...',
  codeExamples: [
    {
      language: 'typescript',
      code: 'const graph = new StateGraph(MyStateAnnotation);',
      explanation: 'Create a new state graph with typed state',
    },
  ],
  references: ['https://langchain.com/docs/state-graphs'],
};
```

## Related Documentation

- [Flows Package](./flows) — LangGraph flow architecture and patterns
- [LLM Providers Package](./llm-providers-package) — Multi-provider LLM abstraction
- [Observability Package](./observability-package) — Langfuse tracing and cost tracking
- [Shared Packages](./shared-packages) — Monorepo package overview

## Next Steps

- **Build a custom content flow**: Extend the pipeline with custom nodes and prompts
- **Set up Langfuse**: Enable tracing and cost tracking for your content generation
- **Experiment with A/B tests**: Test different prompt variants for your use case
- **Integrate with AutoMaker**: Use content generation as part of automated workflows
