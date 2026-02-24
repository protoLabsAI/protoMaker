# @protolabs-ai/observability

Observability package for Automaker with Langfuse integration for prompt management, tracing, and monitoring.

## Features

- **Prompt Management**: Load and version prompts from Langfuse with automatic fallback
- **Distributed Tracing**: Track agent executions, LLM generations, and multi-step operations
- **Automatic Fallback**: Works seamlessly without Langfuse credentials
- **Type-Safe**: Full TypeScript support with comprehensive types
- **Zero Config**: Works out of the box with sensible defaults

## Quick Start

### Installation

This package is part of the Automaker monorepo and is already available:

```typescript
import { LangfuseClient } from '@protolabs-ai/observability';
```

### Basic Usage

```typescript
import { LangfuseClient } from '@protolabs-ai/observability';

// Initialize client (works with or without credentials)
const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  enabled: true,
});

// Create a trace
const trace = langfuse.createTrace({
  name: 'Feature Implementation',
  userId: 'agent-sonnet',
  metadata: { featureId: 'feature-123' },
});

// Log LLM generation
langfuse.createGeneration({
  traceId: trace?.id,
  name: 'code-generation',
  model: 'claude-sonnet-4-5-20250929',
  input: 'Implement authentication',
  output: 'export class AuthService {...}',
  usage: {
    promptTokens: 500,
    completionTokens: 1200,
    totalTokens: 1700,
  },
});

// Flush events
await langfuse.flush();
await langfuse.shutdown();
```

## Setup

### Environment Variables

Configure Langfuse integration with these environment variables:

```bash
# Required for Langfuse integration (optional - works without them)
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# Optional - defaults to https://cloud.langfuse.com
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Optional - set to false to disable Langfuse
LANGFUSE_ENABLED=true
```

**Important**: The package works perfectly without these credentials. All tracing and prompt management calls are safe no-ops in fallback mode.

### Getting Langfuse Credentials

1. Sign up at [https://cloud.langfuse.com](https://cloud.langfuse.com)
2. Create a new project
3. Go to Settings → API Keys
4. Create a new API key pair
5. Copy the public key (`pk-lf-...`) and secret key (`sk-lf-...`)
6. Add them to your `.env` file

For detailed setup instructions, see [docs/setup.md](./docs/setup.md).

## Examples

We provide comprehensive examples to help you get started:

### Prompt Management

```bash
npx tsx libs/observability/examples/prompt-management.ts
```

Demonstrates:

- Loading prompts from Langfuse with versioning
- Using fallback prompts when Langfuse is unavailable
- Variable substitution in prompts
- Tracking prompt usage with metadata

### Tracing

```bash
npx tsx libs/observability/examples/tracing.ts
```

Demonstrates:

- Creating traces and generations
- Multi-step operations with spans
- Error handling and scoring
- Session tracking across features
- Fallback mode behavior

## Core Concepts

### Traces

Traces represent a complete agent execution or workflow:

```typescript
const trace = langfuse.createTrace({
  id: 'trace-123', // Optional: auto-generated if not provided
  name: 'Feature Implementation',
  userId: 'agent-sonnet',
  sessionId: 'session-001', // Optional: group related traces
  metadata: {
    // Optional: custom metadata
    featureId: 'feature-456',
    complexity: 'medium',
  },
  tags: ['implementation'], // Optional: for filtering
});
```

### Generations

Generations log individual LLM API calls:

```typescript
langfuse.createGeneration({
  traceId: trace.id,
  name: 'code-generation',
  model: 'claude-sonnet-4-5-20250929',
  input: 'The prompt sent to the LLM',
  output: 'The LLM response',
  usage: {
    promptTokens: 500,
    completionTokens: 1200,
    totalTokens: 1700,
  },
  metadata: {
    temperature: 0.7,
  },
});
```

### Spans

Spans represent sub-operations within a trace:

```typescript
langfuse.createSpan({
  traceId: trace.id,
  name: 'planning',
  input: 'Analyze requirements',
  output: 'Implementation plan created',
  metadata: {
    step: 1,
    phase: 'planning',
  },
});
```

### Scores

Scores evaluate the quality of generations:

```typescript
langfuse.createScore({
  traceId: trace.id,
  name: 'success',
  value: 1, // 0 = failure, 1 = success
  comment: 'Tests passed',
});
```

## Fallback Mode

The package is designed to work seamlessly without Langfuse:

- All methods are safe to call without credentials
- No errors thrown if Langfuse is unavailable
- Application logic remains unchanged
- Perfect for development and testing

Check if Langfuse is available:

```typescript
if (langfuse.isAvailable()) {
  console.log('Logging to Langfuse');
} else {
  console.log('Running in fallback mode');
}
```

## Best Practices

### Always Provide Fallback Prompts

```typescript
const prompt = await langfuse.getPrompt('my-prompt');
const finalPrompt = prompt?.prompt || 'Hardcoded fallback prompt';
```

### Flush Before Shutdown

```typescript
await langfuse.flush(); // Ensure all events are sent
await langfuse.shutdown();
```

### Use Metadata Effectively

```typescript
langfuse.createGeneration({
  // ... other params
  metadata: {
    featureId: 'feature-123',
    attemptNumber: 2,
    branchName: 'feature/auth',
    // Any custom data for debugging/analysis
  },
});
```

### Group Related Operations

```typescript
const sessionId = 'session-001';

// All traces with same sessionId are grouped
langfuse.createTrace({ sessionId, name: 'Feature 1' });
langfuse.createTrace({ sessionId, name: 'Feature 2' });
```

## Troubleshooting

If you encounter issues, see our [troubleshooting guide](./docs/troubleshooting.md) which covers:

- API key authentication errors
- Network connectivity issues
- Rate limiting and quotas
- Event delivery problems
- Common configuration mistakes

## API Reference

### LangfuseClient

```typescript
class LangfuseClient {
  constructor(config: LangfuseConfig);

  // Check availability
  isAvailable(): boolean;

  // Traces
  createTrace(params: CreateTraceParams): LangfuseTrace | null;

  // Generations
  createGeneration(params: CreateGenerationParams): LangfuseGeneration | null;

  // Spans
  createSpan(params: CreateSpanParams): LangfuseSpan | null;

  // Scores
  createScore(params: CreateScoreParams): void;

  // Prompts
  getPrompt(name: string, version?: number): Promise<LangfusePrompt | null>;

  // Lifecycle
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
```

For complete type definitions, see [src/langfuse/types.ts](./src/langfuse/types.ts).

## Contributing

When contributing to this package:

1. Ensure all code compiles: `npm run build:packages`
2. Run examples to verify functionality
3. Update documentation for any API changes
4. Add tests for new features (if applicable)

## License

Part of the Automaker project.
