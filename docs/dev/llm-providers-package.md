# LLM Providers Package

`@automaker/llm-providers` provides a multi-provider LLM abstraction layer. It defines a unified interface for Anthropic, OpenAI, Google, Groq, Ollama, and Bedrock with Zod-validated configuration, a singleton factory, and health checking.

**Owner:** Sam (AI Agent Engineer)

## Package Structure

```
libs/llm-providers/src/
├── server/
│   ├── base.ts                    # BaseLLMProviderLangChain (LangChain integration)
│   ├── types.ts                   # Runtime provider types (ModelCategory, LLMProvider, etc.)
│   ├── config/
│   │   ├── types.ts               # Config type definitions (ProviderName, ProviderConfig)
│   │   ├── schema.ts              # Zod validation schemas
│   │   └── default-config.ts      # ANTHROPIC_MODELS, getModelIdForTier()
│   ├── factory/
│   │   └── provider-factory.ts    # ProviderFactory singleton
│   └── providers/
│       ├── base.ts                # BaseLLMProvider (canonical base class)
│       ├── base-provider.ts       # BaseProvider (@automaker/types-based)
│       ├── anthropic.ts           # AnthropicProvider
│       ├── openai.ts              # OpenAIProvider
│       ├── google.ts              # GoogleProvider
│       ├── groq.ts                # GroqProvider
│       ├── ollama.ts              # OllamaProvider
│       └── bedrock.ts             # BedrockProvider
└── index.ts
```

## Provider Hierarchy

Three base classes exist from parallel development. For new providers, extend `BaseLLMProvider`:

| Base Class                 | Location                            | Use                                                                                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `BaseLLMProvider`          | `server/providers/base.ts`          | **Canonical.** Config-based, abstract methods for `createModel`, `initialize`, `validateConfig` |
| `BaseLLMProviderLangChain` | `server/base.ts`                    | LangChain integration with model tiers, health checks                                           |
| `BaseProvider`             | `server/providers/base-provider.ts` | `@automaker/types`-based, simpler interface                                                     |

### BaseLLMProvider API

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
  abstract validateConfig(): void;
}
```

## Configuration

### Provider Config Types

```typescript
type ProviderName = 'anthropic' | 'openai' | 'google' | 'groq' | 'ollama' | 'bedrock';

type ModelCategory = 'fast' | 'balanced' | 'powerful' | 'embedding' | 'vision';

interface ProviderConfig {
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  models: Partial<Record<ModelCategory, string>>;
}

interface LLMProvidersConfig {
  defaultProvider: ProviderName;
  providers: Record<string, ProviderConfig>;
}
```

### Zod Validation

All configuration is validated before use:

```typescript
import {
  validateProviderConfig,
  validateLLMProvidersConfig,
  providerConfigSchema,
  llmProvidersConfigSchema,
} from '@automaker/llm-providers';

// Validate a single provider config
const config = validateProviderConfig(rawConfig);

// Validate the full multi-provider config
const fullConfig = validateLLMProvidersConfig(rawFullConfig);
```

## ProviderFactory

Singleton factory for creating and managing provider instances:

```typescript
import { ProviderFactory } from '@automaker/llm-providers';

// Get the singleton
const factory = ProviderFactory.getInstance();

// Initialize with validated config
factory.initialize({
  defaultProvider: 'anthropic',
  providers: {
    anthropic: {
      name: 'anthropic',
      enabled: true,
      apiKey: process.env.ANTHROPIC_API_KEY,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        balanced: 'claude-sonnet-4-5-20250929',
        powerful: 'claude-opus-4-5-20251101',
      },
    },
  },
});

// Register provider instances
factory.registerProvider('anthropic', new AnthropicProvider(config));

// Get a provider
const provider = factory.getProvider('anthropic'); // specific
const defaultProvider = factory.getProvider(); // default

// Get a model for a category
const model = factory.getModel('balanced', 'anthropic');
```

Factory methods:

| Method                                    | Description                     |
| ----------------------------------------- | ------------------------------- |
| `getInstance()`                           | Get the singleton instance      |
| `resetInstance()`                         | Reset singleton (testing)       |
| `initialize(config)`                      | Set validated config            |
| `registerProvider(name, provider)`        | Register a provider instance    |
| `getProvider(name?)`                      | Get provider by name or default |
| `getModel(category, provider?, options?)` | Get a model instance            |
| `hasProvider(name)`                       | Check if registered             |
| `getProviders()`                          | Get all registered providers    |
| `clearProviders()`                        | Clear all providers             |

## Available Providers

### AnthropicProvider

Primary provider with health check caching (60s TTL):

```typescript
import { AnthropicProvider } from '@automaker/llm-providers';

const provider = new AnthropicProvider({
  name: 'anthropic',
  enabled: true,
  apiKey: process.env.ANTHROPIC_API_KEY,
  models: {
    fast: 'claude-haiku-4-5-20251001',
    balanced: 'claude-sonnet-4-5-20250929',
    powerful: 'claude-opus-4-5-20251101',
  },
});
```

### OllamaProvider

Local model provider with configurable inference parameters:

```typescript
import { OllamaProvider } from '@automaker/llm-providers';

// OllamaConfig extends ProviderConfig with:
// - host?: string (default: http://localhost:11434)
// - defaultModel?: string
// - temperature?: number
// - numPredict?: number
```

### BedrockProvider

AWS Bedrock with region and credential validation (missing values are warnings, not errors):

```typescript
import { BedrockProvider } from '@automaker/llm-providers';
```

### Other Providers

- `OpenAIProvider` — OpenAI API
- `GoogleProvider` — Google AI (Gemini)
- `GroqProvider` — Groq inference

## Default Model Config

```typescript
import { ANTHROPIC_MODELS, getModelIdForTier } from '@automaker/llm-providers';

// ANTHROPIC_MODELS contains the full model catalog
// getModelIdForTier('fast') → returns the model ID for that tier
```

## Adding a New Provider

1. Create `libs/llm-providers/src/server/providers/my-provider.ts`
2. Extend `BaseLLMProvider`
3. Implement `createModel()`, `initialize()`, `validateConfig()`
4. Add the provider name to `ProviderName` union in `config/types.ts`
5. Add to Zod schema in `config/schema.ts`
6. Export from `index.ts`
7. Register with `ProviderFactory` at application startup

```typescript
import { BaseLLMProvider } from '@automaker/llm-providers';

export class MyProvider extends BaseLLMProvider {
  async initialize(): Promise<void> {
    // Setup client, validate connection
  }

  validateConfig(): void {
    if (!this.getApiKey()) {
      console.warn('MyProvider: Missing API key');
    }
  }

  createModel(category: ModelCategory, options?: Record<string, unknown>): unknown {
    const modelName = this.getModelForCategory(category);
    if (!modelName) throw new Error(`No model for category: ${category}`);
    // Return model instance
  }
}
```

## Dependencies

```
@langchain/anthropic   # Anthropic LangChain integration
@langchain/community   # Community LangChain providers
@langchain/core        # LangChain core types
zod                    # Schema validation
@automaker/types       # Shared type definitions
@automaker/utils       # Logging
```
