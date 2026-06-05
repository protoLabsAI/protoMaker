# Model Resolver

The Model Resolver (`@protolabsai/model-resolver`) converts human-friendly model aliases into the provider strings the runtime actually uses. For Claude, that target is a **protoLabs gateway tier** — all Claude routing goes through the gateway (`api.proto-labs.ai`), and the gateway-issued API key is the only credential the product expects.

## Overview

Instead of pinning a versioned model string, code and config use a short alias like `sonnet` or `opus`. `resolveModelString()` handles:

- **Alias → gateway tier** — `sonnet` → `protolabs/smart`
- **Legacy migration** — old versioned IDs (`claude-sonnet-4-6`, `claude-opus-4-5`, …) migrate to the equivalent gateway tier
- **Provider pass-through** — Cursor (`cursor-*`), Codex (`codex-*`), OpenCode, and Groq model strings are returned unchanged for their providers
- **Default fallback** — an empty/unknown alias returns `DEFAULT_MODELS.claude` (`protolabs/reasoning`)

## Model Hierarchy

Claude work resolves to one of three gateway tiers:

| Alias    | Canonical ID    | Resolves to           | Use Case                                      |
| -------- | --------------- | --------------------- | --------------------------------------------- |
| `haiku`  | `claude-haiku`  | `protolabs/fast`      | Quick/trivial tasks, commits, branch names    |
| `sonnet` | `claude-sonnet` | `protolabs/smart`     | Standard feature implementation (workhorse)   |
| `opus`   | `claude-opus`   | `protolabs/reasoning` | Architecture, spec generation, deep reasoning |

The gateway maps each tier to a concrete frontier model; the product never needs a versioned Claude ID. See the auto-mode model hierarchy in the project README/CLAUDE.md for how tiers map to feature complexity.

**Auto-escalation:** features that fail 2+ times escalate to `DEFAULT_MODELS.claude` (`protolabs/reasoning`) on retry.

## Usage

### Basic Resolution

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';

// Alias → gateway tier
resolveModelString('sonnet'); // → 'protolabs/smart'
resolveModelString('opus'); // → 'protolabs/reasoning'
resolveModelString('haiku'); // → 'protolabs/fast'

// Canonical aliases resolve to the same tiers
resolveModelString('claude-sonnet'); // → 'protolabs/smart'

// Legacy versioned IDs migrate to the tier
resolveModelString('claude-sonnet-4-6'); // → 'protolabs/smart'
resolveModelString('claude-opus-4-5'); // → 'protolabs/reasoning'

// Other providers pass through unchanged
resolveModelString('cursor-composer-1'); // → 'cursor-composer-1'
resolveModelString('codex-gpt-5.5'); // → 'codex-gpt-5.5'

// Undefined/empty returns the default (DEFAULT_MODELS.claude)
resolveModelString(undefined); // → 'protolabs/reasoning'
```

### In Agent Configuration

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';

const config = {
  defaultModel: resolveModelString('sonnet'), // → 'protolabs/smart'
  escalationModel: resolveModelString('opus'), // → 'protolabs/reasoning'
};
```

### In Feature Execution

```typescript
// Model resolution happens inside the Lead Engineer INTAKE phase.
// When creating a feature, specify the alias — the pipeline resolves it:
mcp__plugin_protolabs_studio__create_feature({
  projectPath: '/path/to/project',
  title: 'Core Infrastructure',
  model: 'opus', // Resolved to protolabs/reasoning at INTAKE
  complexity: 'architectural',
});
```

### In MCP Tools

```typescript
// Alias — resolved by the pipeline
mcp__plugin_protolabs_studio__start_agent({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  model: 'sonnet', // → protolabs/smart
});

// A gateway tier or any provider string is also accepted as-is
mcp__plugin_protolabs_studio__start_agent({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  model: 'protolabs/reasoning',
});
```

## Supported Aliases

### Claude (resolve to gateway tiers)

| Input                                                       | Resolves to           |
| ----------------------------------------------------------- | --------------------- |
| `haiku`, `claude-haiku`, `claude-haiku-4-5*`                | `protolabs/fast`      |
| `sonnet`, `claude-sonnet`, `claude-sonnet-4-5*`, `…-4-6`    | `protolabs/smart`     |
| `opus`, `claude-opus`, `claude-opus-4-5`, `claude-opus-4-6` | `protolabs/reasoning` |

The bare aliases (`CLAUDE_MODEL_MAP`), canonical IDs (`CLAUDE_CANONICAL_MAP`), and legacy versioned strings (`LEGACY_CLAUDE_FULL_MODEL_MAP`) all live in `libs/types/src/model.ts`.

### Other providers

| Input pattern                         | Behavior                                        |
| ------------------------------------- | ----------------------------------------------- |
| `cursor-*`                            | Passed through (Cursor CLI provider)            |
| `codex-*`                             | Passed through (Codex/OpenAI provider)          |
| OpenCode (`opencode-*` or `prov/mod`) | Passed through (OpenCode provider)              |
| Groq aliases / IDs / `groq/*`         | Resolved/passed through (Groq provider)         |
| Anything else                         | Passed through unchanged (custom gateway model) |

## Configuration

### Default Model

The default returned for an unspecified/unknown model is `DEFAULT_MODELS.claude` (`protolabs/reasoning`), defined in `libs/types/src/model.ts`. Per-tier model defaults are configurable in **Settings → AI Models → Model Defaults**.

### Per-Feature Override

```typescript
mcp__plugin_protolabs_studio__create_feature({
  projectPath: '/path/to/project',
  title: 'Performance Optimization',
  description: '...',
  model: 'opus', // Override the tier for this feature
  complexity: 'architectural',
});
```

## Complexity-Based Model Selection

Auto-mode selects a tier from feature complexity (see the Model Hierarchy in CLAUDE.md):

| Complexity             | Tier                                    |
| ---------------------- | --------------------------------------- |
| `small`                | `protolabs/fast`                        |
| `medium`, `large`      | `protolabs/smart`                       |
| `architectural`        | `protolabs/reasoning`                   |
| any, after 2+ failures | `protolabs/reasoning` (auto-escalation) |

## Auto-Escalation

When a feature fails multiple times, the Lead Engineer state machine escalates:

1. Feature fails at its current tier.
2. `LeadEngineerService` increments `failureCount` and transitions to ESCALATE.
3. On retry, INTAKE checks `failureCount >= 2` and selects `DEFAULT_MODELS.claude` (`protolabs/reasoning`).
4. If that also fails, the feature stays in ESCALATE for human intervention.

This is automatic — no manual escalation code needed. The circuit breaker pauses dispatch after consecutive failures.

## Testing

```typescript
import { resolveModelString } from '@protolabsai/model-resolver';
import { describe, it, expect } from 'vitest';

describe('resolveModelString', () => {
  it('resolves aliases to gateway tiers', () => {
    expect(resolveModelString('sonnet')).toBe('protolabs/smart');
    expect(resolveModelString('opus')).toBe('protolabs/reasoning');
    expect(resolveModelString('haiku')).toBe('protolabs/fast');
  });

  it('migrates legacy versioned IDs to tiers', () => {
    expect(resolveModelString('claude-sonnet-4-6')).toBe('protolabs/smart');
  });

  it('passes through non-Claude provider strings', () => {
    expect(resolveModelString('cursor-composer-1')).toBe('cursor-composer-1');
  });

  it('returns the default for undefined', () => {
    expect(resolveModelString(undefined)).toBe('protolabs/reasoning');
  });
});
```

## Learn More

- [AI Providers](../integrations/ai-providers.md) — provider abstraction and gateway routing
- `libs/types/src/model.ts` — the alias/canonical/legacy maps and `DEFAULT_MODELS`
- `libs/model-resolver/src/resolver.ts` — `resolveModelString()` implementation
