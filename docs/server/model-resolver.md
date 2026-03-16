# Model Resolver

The Model Resolver (`@protolabsai/model-resolver`) converts human-friendly model aliases to full model identifiers used by AI providers. This system enables consistent model selection across protoLabs Studio while simplifying configuration.

## Overview

Instead of using full model strings like `claude-sonnet-4-6`, users can specify aliases like `sonnet`. The resolver handles:

- **Alias expansion** - `sonnet` → `claude-sonnet-4-6`
- **Version pinning** - Specific versions for reproducibility
- **Provider detection** - Auto-detect Claude vs OpenAI vs custom
- **Fallback handling** - Graceful degradation when models are unavailable

## Model Hierarchy

protoLabs Studio uses a three-tier model system:

| Alias    | Model ID                    | Provider | Use Case                              | Cost (per 1M tokens)        |
| -------- | --------------------------- | -------- | ------------------------------------- | --------------------------- |
| `haiku`  | `claude-haiku-4-5-20251001` | Claude   | Quick tasks, simple features          | $0.80 input, $4.00 output   |
| `sonnet` | `claude-sonnet-4-6`         | Claude   | Standard features (default)           | $3.00 input, $15.00 output  |
| `opus`   | `claude-opus-4-6`           | Claude   | Architectural decisions, complex work | $15.00 input, $75.00 output |

**Auto-escalation:** Features that fail 2+ times automatically escalate to opus on retry.

## Usage

### Basic Resolution

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';

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

### In Feature Execution

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';

// Model resolution happens inside the Lead Engineer INTAKE phase.
// When creating a feature, specify the alias — the pipeline resolves it:
mcp__protolabs__create_feature({
  projectPath: '/path/to/project',
  title: 'Core Infrastructure',
  model: 'opus', // Resolved to claude-opus-4-6 at INTAKE
  complexity: 'architectural',
});

// Or resolve manually for direct SDK calls:
const model = resolveModelString('opus'); // → 'claude-opus-4-6'
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
};
```

### Custom Models

Any model string not matching an alias is passed through unchanged:

```typescript
resolveModelString('custom-model-v1'); // → 'custom-model-v1'
resolveModelString('local-llama-70b'); // → 'local-llama-70b'
```

## Configuration

### Global Default Model

Set the default model in `settings.json`:

```json
{
  "defaultModel": "sonnet"
}
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

protoLabs Studio automatically selects models based on feature complexity:

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

## Auto-Escalation

When a feature fails multiple times, the Lead Engineer state machine auto-escalates to a more capable model:

1. Feature fails at current tier (e.g., Sonnet)
2. `LeadEngineerService` increments `failureCount` and transitions to ESCALATE
3. On retry, the INTAKE phase checks `failureCount >= 2` and selects Opus
4. If Opus also fails, the feature stays in ESCALATE for human intervention

This is handled automatically by the pipeline — no manual escalation code needed.

## Version Pinning

For reproducibility, use versioned aliases:

```typescript
// ❌ Unpinned (may change over time)
model: 'sonnet'; // Resolves to latest sonnet

// ✅ Pinned (stable)
model: 'sonnet-4-6'; // Always uses claude-sonnet-4-6

// ✅ Fully qualified (most stable)
model: 'claude-sonnet-4-6'; // Specific version
```

**When to pin:**

- Production deployments
- Reproducible research
- Compliance requirements

## Testing

### Unit Tests

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';
import { describe, it, expect } from 'vitest';

describe('resolveModelString', () => {
  it('resolves aliases', () => {
    expect(resolveModelString('sonnet')).toBe('claude-sonnet-4-6');
    expect(resolveModelString('opus')).toBe('claude-opus-4-6');
    expect(resolveModelString('haiku')).toBe('claude-haiku-4-5-20251001');
  });

  it('passes through full model strings', () => {
    expect(resolveModelString('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('returns default for undefined', () => {
    expect(resolveModelString(undefined)).toBe('claude-sonnet-4-6');
  });
});
```

## Troubleshooting

### "Model not found"

**Issue:** Provider doesn't recognize resolved model string.

**Solution:** Check if model ID is current. Update resolver if model was renamed:

```typescript
// Update alias mapping in libs/model-resolver/src/index.ts
const CLAUDE_ALIASES = {
  sonnet: 'claude-sonnet-4-7', // Updated
};
```

### "Unexpected model behavior"

**Issue:** Model output differs from expected.

**Solution:** Verify correct model is resolved:

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';

console.log('Resolved model:', resolveModelString('sonnet'));
// Should print: 'claude-sonnet-4-6'
```

## Learn More

- [Claude Model Docs](https://docs.anthropic.com/claude/docs/models-overview) - Official model documentation
- [Monorepo Architecture](../dev/monorepo-architecture.md) - Package structure
