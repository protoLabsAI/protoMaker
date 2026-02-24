# @protolabs-ai/llm-providers

> Unified LLM provider abstraction layer for AutoMaker

A flexible, type-safe abstraction layer for working with multiple LLM providers (Anthropic, OpenAI, Google, Ollama) through a unified interface. Switch providers, select models by capability category, and handle failures gracefully.

## Features

- 🔄 **Provider Abstraction** - Single interface for multiple LLM providers
- 🎯 **Category-Based Selection** - Choose models by capability (fast, smart, reasoning, vision, coding)
- 🛡️ **Type Safety** - Full TypeScript support with Zod validation
- 🔌 **Hot-Swappable** - Switch providers at runtime without code changes
- 🏥 **Health Monitoring** - Built-in health checks and diagnostics
- 🎭 **Graceful Fallbacks** - Automatic provider failover on errors
- ⚙️ **Zero Config Mode** - Works without API keys for testing

## Quick Start

### Installation

```bash
npm install @protolabs-ai/llm-providers
```

### Basic Usage

```typescript
import { ProviderFactory } from '@protolabs-ai/llm-providers';
import type { LLMProvidersConfig } from '@protolabs-ai/llm-providers';

// Configure providers
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        smart: 'claude-sonnet-4-5-20250929',
        reasoning: 'claude-opus-4-5-20251101',
      },
    },
    openai: {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      enabled: true,
      models: {
        fast: 'gpt-4o-mini',
        smart: 'gpt-4o',
        vision: 'gpt-4o',
      },
    },
  },
  defaultProvider: 'anthropic',
};

// Initialize factory
const factory = ProviderFactory.getInstance();
factory.initialize(config);

// Get a model by category
const model = factory.getModel('smart');

// Switch providers
const openaiModel = factory.getModel('fast', 'openai');
```

## Model Categories

The library uses semantic categories instead of specific model names:

| Category    | Use Case                      | Example Models                      |
| ----------- | ----------------------------- | ----------------------------------- |
| `fast`      | Quick responses, simple tasks | claude-haiku, gpt-4o-mini, llama3.2 |
| `smart`     | General-purpose, balanced     | claude-sonnet, gpt-4o, llama3.1     |
| `reasoning` | Complex logic, deep thinking  | claude-opus, o1                     |
| `vision`    | Image understanding           | gpt-4o, claude-sonnet               |
| `coding`    | Code generation/analysis      | claude-sonnet, gpt-4o, codestral    |

## Examples

The `examples/` directory contains working demonstrations:

```bash
# Run basic usage examples
cd libs/llm-providers/examples
npm install
npm run example:basic-usage

# Run health check examples
npm run example:health-checks

# Run all examples
npm run example:all
```

### Example: Provider Switching

```typescript
// Use default provider (anthropic)
const model1 = factory.getModel('smart');

// Explicitly use OpenAI
const model2 = factory.getModel('smart', 'openai');

// Explicitly use Ollama
const model3 = factory.getModel('smart', 'ollama');
```

### Example: Automatic Fallback

```typescript
const preferredProviders = ['anthropic', 'openai', 'ollama'];

let model = null;
for (const provider of preferredProviders) {
  try {
    model = factory.getModel('vision', provider);
    break;
  } catch (error) {
    console.log(`${provider} failed, trying next...`);
  }
}

if (!model) {
  // Fallback to non-vision model
  model = factory.getModel('smart');
}
```

### Example: Health Check

```typescript
function checkHealth(providerName: string) {
  try {
    const provider = factory.getProvider(providerName);
    console.log(`✓ ${providerName} healthy`);
    console.log(`  Categories: ${provider.getSupportedCategories().join(', ')}`);
    return true;
  } catch (error) {
    console.log(`✗ ${providerName} unhealthy: ${error.message}`);
    return false;
  }
}

const providers = ['anthropic', 'openai', 'ollama'];
const healthyCount = providers.filter(checkHealth).length;
console.log(`${healthyCount}/${providers.length} providers available`);
```

## Configuration

See [docs/configuration.md](./docs/configuration.md) for detailed configuration options including:

- Environment variables
- Per-provider settings
- Model mappings
- Base URL overrides (for Ollama/local models)
- Enabling/disabling providers

### Minimal Configuration

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
      },
    },
  },
  defaultProvider: 'anthropic',
};
```

### Full Configuration

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        smart: 'claude-sonnet-4-5-20250929',
        reasoning: 'claude-opus-4-5-20251101',
        coding: 'claude-sonnet-4-5-20250929',
      },
    },
    openai: {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      enabled: true,
      models: {
        fast: 'gpt-4o-mini',
        smart: 'gpt-4o',
        reasoning: 'o1',
        vision: 'gpt-4o',
        coding: 'gpt-4o',
      },
    },
    ollama: {
      name: 'ollama',
      baseUrl: 'http://localhost:11434',
      enabled: true,
      models: {
        fast: 'llama3.2:3b',
        smart: 'llama3.1:70b',
        coding: 'codestral:latest',
      },
    },
  },
  defaultProvider: 'anthropic',
};
```

## API Reference

See [docs/api-reference.md](./docs/api-reference.md) for complete API documentation.

### ProviderFactory

The main entry point for provider management.

```typescript
class ProviderFactory {
  static getInstance(): ProviderFactory;
  static resetInstance(): void;

  initialize(config: LLMProvidersConfig): void;
  isInitialized(): boolean;

  registerProvider(name: ProviderName, provider: BaseLLMProvider): void;
  getProvider(name?: ProviderName): BaseLLMProvider;
  getModel(
    category: ModelCategory,
    provider?: ProviderName,
    options?: Record<string, unknown>
  ): unknown;
}
```

### BaseLLMProvider

Abstract base class that all providers extend.

```typescript
abstract class BaseLLMProvider {
  getName(): string;
  isEnabled(): boolean;
  getApiKey(): string | undefined;
  getBaseUrl(): string | undefined;
  getModelForCategory(category: ModelCategory): string | undefined;
  supportsCategory(category: ModelCategory): boolean;
  getSupportedCategories(): ModelCategory[];

  abstract createModel(category: ModelCategory, options?: Record<string, unknown>): unknown;
  abstract initialize(): Promise<void>;
  abstract validate(): Promise<void>;
}
```

## Architecture

```
┌─────────────────────┐
│  ProviderFactory    │  ← Singleton, manages all providers
│  (Singleton)        │
└──────────┬──────────┘
           │
           ├─────────────────────────────────────┐
           │                                     │
  ┌────────▼──────────┐              ┌──────────▼────────┐
  │ AnthropicProvider │              │  OpenAIProvider   │
  │ (BaseLLMProvider) │              │ (BaseLLMProvider) │
  └───────────────────┘              └───────────────────┘
           │                                     │
           │                                     │
  ┌────────▼──────────┐              ┌──────────▼────────┐
  │  Claude Models    │              │   GPT Models      │
  │  (fast/smart/etc) │              │  (fast/smart/etc) │
  └───────────────────┘              └───────────────────┘
```

## Environment Variables

```bash
# Required for production use
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional for local/custom endpoints
OLLAMA_BASE_URL=http://localhost:11434
```

## Error Handling

The library provides clear error messages for common issues:

```typescript
try {
  const model = factory.getModel('vision', 'anthropic');
} catch (error) {
  if (error.message.includes('not found')) {
    // Provider not registered
  } else if (error.message.includes('disabled')) {
    // Provider disabled in config
  } else if (error.message.includes('does not support')) {
    // Category not available for this provider
  }
}
```

## Troubleshooting

### Factory not initialized

**Error:** `ProviderFactory not initialized. Call initialize() first.`

**Solution:** Call `factory.initialize(config)` before using the factory.

```typescript
const factory = ProviderFactory.getInstance();
factory.initialize(config); // ← Required
```

### Provider not found

**Error:** `Provider 'xyz' not found.`

**Solution:** Ensure the provider is registered and spelled correctly. Available providers: `anthropic`, `openai`, `google`, `ollama`.

### Category not supported

**Error:** `Provider 'anthropic' does not support category 'vision'.`

**Solution:** Check which categories your provider supports:

```typescript
const provider = factory.getProvider('anthropic');
console.log(provider.getSupportedCategories());
// Output: ['fast', 'smart', 'reasoning', 'coding']
```

### Provider disabled

**Error:** `Provider 'openai' is disabled`

**Solution:** Set `enabled: true` in your provider configuration.

### Invalid configuration

**Error:** Validation errors from Zod

**Solution:** Ensure your config matches the `LLMProvidersConfig` type. See [docs/configuration.md](./docs/configuration.md).

## Testing

The library works without API keys for testing purposes:

```typescript
// Config without API keys (for testing)
const testConfig: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      // No apiKey needed for testing
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
      },
    },
  },
  defaultProvider: 'anthropic',
};

const factory = ProviderFactory.getInstance();
factory.initialize(testConfig);

// This will work (returns a mock/fallback model)
const model = factory.getModel('fast');
```

## Contributing

When adding a new provider:

1. Create a class that extends `BaseLLMProvider`
2. Implement the required abstract methods
3. Add the provider name to `ProviderName` type in `config/types.ts`
4. Register the provider in the factory
5. Add tests and documentation

See [docs/adding-providers.md](./docs/adding-providers.md) for detailed instructions.

## License

SEE LICENSE IN LICENSE

## Related Documentation

- [Configuration Guide](./docs/configuration.md) - Detailed configuration options
- [API Reference](./docs/api-reference.md) - Complete API documentation
- [Examples](./examples/) - Working code examples
- [AutoMaker Documentation](../../docs/) - Main project documentation
