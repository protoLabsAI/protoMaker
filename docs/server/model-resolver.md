# Model Resolver

The Model Resolver (`@protolabs-ai/model-resolver`) converts human-friendly model aliases to full model identifiers used by AI providers. This system enables consistent model selection across Automaker while simplifying configuration.

## Overview

Instead of using full model strings like `claude-sonnet-4-6-20250929`, users can specify aliases like `sonnet`. The resolver handles:

- **Alias expansion** - `sonnet` → `claude-sonnet-4-6`
- **Version pinning** - Specific versions for reproducibility
- **Provider detection** - Auto-detect Claude vs OpenAI vs custom
- **Fallback handling** - Graceful degradation when models are unavailable

## Model Hierarchy

Automaker uses a three-tier model system:

| Alias    | Model ID                    | Provider | Use Case                              | Cost (per 1M tokens)        |
| -------- | --------------------------- | -------- | ------------------------------------- | --------------------------- |
| `haiku`  | `claude-haiku-4-5-20251001` | Claude   | Quick tasks, simple features          | $0.80 input, $4.00 output   |
| `sonnet` | `claude-sonnet-4-6`         | Claude   | Standard features (default)           | $3.00 input, $15.00 output  |
| `opus`   | `claude-opus-4-6`           | Claude   | Architectural decisions, complex work | $15.00 input, $75.00 output |

**Auto-escalation:** Features that fail 2+ times automatically escalate to opus on retry.

## Usage

### Basic Resolution

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';

// Alias expansion
resolveModelString('sonnet'); // → 'claude-sonnet-4-6'
resolveModelString('opus'); // → 'claude-opus-4-6'
resolveModelString('haiku'); // → 'claude-haiku-4-5-20251001'

// Pass-through for full model strings
resolveModelString('claude-sonnet-4-6'); // → 'claude-sonnet-4-6'
resolveModelString('gpt-4-turbo'); // → 'gpt-4-turbo'

// Undefined/null returns default
resolveModelString(undefined); // → 'claude-sonnet-4-6'
resolveModelString(null); // → 'claude-sonnet-4-6'
```

### In Agent Configuration

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';
import type { AgentTemplate } from '@protolabs-ai/types';

const agentTemplate: AgentTemplate = {
  role: 'backend-engineer',
  identity: { name: 'Backend Engineer', description: '...' },
  capabilities: {
    canImplementFeatures: true,
    canReviewCode: true,
  },
  defaultModel: resolveModelString('sonnet'), // Uses claude-sonnet-4-6
  securityLevel: 'standard',
};
```

### In Feature Execution

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';
import type { ExecuteOptions } from '@protolabs-ai/types';

const executeOptions: ExecuteOptions = {
  featureId: 'feature-123',
  model: resolveModelString('opus'), // Use opus for complex task
  branchName: 'feature/my-feature',
  complexity: 'architectural',
};

await executeFeature(executeOptions);
```

### In MCP Tools

```typescript
// MCP tool call with alias
mcp__protolabs__start_agent({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  model: 'sonnet', // Automatically resolved to claude-sonnet-4-6
});

// Or use full model string
mcp__protolabs__start_agent({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  model: 'claude-opus-4-6', // Passed through as-is
});
```

## Supported Aliases

### Claude Models

```typescript
const CLAUDE_ALIASES = {
  // Latest generations (recommended)
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',

  // Versioned aliases (pinned for reproducibility)
  'opus-4-6': 'claude-opus-4-6',
  'sonnet-4-6': 'claude-sonnet-4-6',
  'sonnet-4-5': 'claude-sonnet-4-5',
  'haiku-4-5': 'claude-haiku-4-5-20251001',

  // Legacy (for compatibility)
  'claude-4': 'claude-sonnet-4-6', // Default to sonnet
};
```

### OpenAI Models

```typescript
const OPENAI_ALIASES = {
  'gpt-4': 'gpt-4-turbo',
  'gpt-3.5': 'gpt-3.5-turbo',
  o1: 'o1-preview',
};
```

### Custom Models

Any model string not matching an alias is passed through unchanged:

```typescript
resolveModelString('custom-model-v1'); // → 'custom-model-v1'
resolveModelString('local-llama-70b'); // → 'local-llama-70b'
```

## Provider Detection

The resolver can extract provider information from model strings:

```typescript
import { stripProviderPrefix } from '@protolabs-ai/types';

// Removes provider prefix
stripProviderPrefix('claude-sonnet-4-6'); // → 'sonnet-4-6'
stripProviderPrefix('gpt-4-turbo'); // → '4-turbo'
stripProviderPrefix('custom:my-model'); // → 'my-model'

// Detect provider
function getProvider(model: string): string {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1-')) return 'openai';
  return 'custom';
}
```

## Configuration

### Global Default Model

Set the default model in `settings.json` or environment variables:

```json
{
  "defaultModel": "sonnet"
}
```

Or via environment variable:

```bash
AUTOMAKER_DEFAULT_MODEL=opus npm run dev
```

### Per-Project Override

Override model selection in `.automaker/settings.json`:

```json
{
  "defaultModel": "haiku",
  "complexityThresholds": {
    "small": "haiku",
    "medium": "sonnet",
    "large": "sonnet",
    "architectural": "opus"
  }
}
```

### Per-Feature Override

Specify model when creating a feature:

```typescript
mcp__protolabs__create_feature({
  projectPath: '/path/to/project',
  title: 'Performance Optimization',
  description: '...',
  model: 'opus', // Override default
  complexity: 'architectural',
});
```

## Complexity-Based Model Selection

Automaker automatically selects models based on feature complexity:

```typescript
interface ComplexityMapping {
  small: string; // Trivial tasks → haiku
  medium: string; // Standard features → sonnet
  large: string; // Complex features → sonnet
  architectural: string; // System design → opus
}

const DEFAULT_MAPPING: ComplexityMapping = {
  small: 'haiku',
  medium: 'sonnet',
  large: 'sonnet',
  architectural: 'opus',
};
```

**Usage:**

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';

function getModelForComplexity(complexity: string): string {
  const mapping = settings.complexityThresholds || DEFAULT_MAPPING;
  const alias = mapping[complexity] || 'sonnet';
  return resolveModelString(alias);
}

// Example
const model = getModelForComplexity('architectural'); // → 'claude-opus-4-6'
```

## Auto-Escalation

When a feature fails multiple times, Automaker auto-escalates to a more capable model:

```typescript
async function executeWithEscalation(feature: Feature) {
  let currentModel = resolveModelString(feature.model || 'sonnet');
  let failureCount = 0;

  while (failureCount < 3) {
    try {
      return await executeFeature({ ...feature, model: currentModel });
    } catch (error) {
      failureCount++;

      if (failureCount >= 2) {
        // Escalate to opus after 2 failures
        currentModel = resolveModelString('opus');
        logger.warn('Escalating to opus after failures', { featureId: feature.id });
      }
    }
  }

  throw new Error('Feature failed after escalation');
}
```

## Version Pinning

For reproducibility, use versioned aliases:

```typescript
// ❌ Unpinned (may change over time)
model: 'sonnet'; // Resolves to latest sonnet

// ✅ Pinned (stable)
model: 'sonnet-4-6'; // Always uses claude-sonnet-4-6

// ✅ Fully qualified (most stable)
model: 'claude-sonnet-4-6-20250929'; // Specific build
```

**When to pin:**

- Production deployments
- Reproducible research
- Compliance requirements

**When to use latest:**

- Development
- Rapid iteration
- Benefit from latest improvements

## Custom Resolvers

You can extend the resolver with custom logic:

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';

function customResolve(input: string | undefined): string {
  // Custom logic
  if (input === 'experimental') {
    return 'claude-opus-4-6';
  }

  // Fallback to default resolver
  return resolveModelString(input);
}

// Use in your code
const model = customResolve('experimental'); // → 'claude-opus-4-6'
```

## Testing

### Unit Tests

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { describe, it, expect } from 'vitest';

describe('resolveModelString', () => {
  it('resolves aliases', () => {
    expect(resolveModelString('sonnet')).toBe('claude-sonnet-4-6');
    expect(resolveModelString('opus')).toBe('claude-opus-4-6');
    expect(resolveModelString('haiku')).toBe('claude-haiku-4-5-20251001');
  });

  it('passes through full model strings', () => {
    expect(resolveModelString('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveModelString('gpt-4-turbo')).toBe('gpt-4-turbo');
  });

  it('returns default for undefined', () => {
    expect(resolveModelString(undefined)).toBe('claude-sonnet-4-6');
    expect(resolveModelString(null)).toBe('claude-sonnet-4-6');
  });
});
```

### Integration Tests

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { executeFeature } from './agent-service.js';

describe('Model resolution in agent execution', () => {
  it('uses resolved model', async () => {
    const feature = {
      id: 'feature-123',
      model: 'haiku', // Alias
    };

    const result = await executeFeature(feature);

    expect(result.modelUsed).toBe('claude-haiku-4-5-20251001');
  });
});
```

## Troubleshooting

### \"Model not found\"

**Issue:** Provider doesn't recognize resolved model string.

**Solution:** Check if model ID is current. Update resolver if model was renamed:

```typescript
// Update alias mapping in libs/model-resolver/src/index.ts
const CLAUDE_ALIASES = {
  sonnet: 'claude-sonnet-4-7', // Updated
};
```

### \"Unexpected model behavior\"

**Issue:** Model output differs from expected.

**Solution:** Verify correct model is resolved:

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';

console.log('Resolved model:', resolveModelString('sonnet'));
// Should print: 'claude-sonnet-4-6'
```

### \"Cannot resolve custom alias\"

**Issue:** Custom alias not recognized.

**Solution:** Use full model string or update resolver:

```typescript
// Option 1: Use full string
model: 'custom-model-v1';

// Option 2: Extend resolver (see Custom Resolvers section)
```

## Learn More

- [Agent SDK Integration](../agents/sdk-integration.md) - How models are used in agents
- [Monorepo Architecture](../dev/monorepo-architecture.md) - Package structure
- [Claude Model Docs](https://docs.anthropic.com/claude/docs/models-overview) - Official model documentation
