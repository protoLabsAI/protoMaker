# API Reference

Complete API reference for `@protolabs-ai/llm-providers`.

## Table of Contents

- [Types](#types)
- [ProviderFactory](#providerfactory)
- [BaseLLMProvider](#basellmprovider)
- [Validation](#validation)
- [Error Handling](#error-handling)

## Types

### ModelCategory

Semantic categories for model selection.

```typescript
type ModelCategory = 'fast' | 'smart' | 'reasoning' | 'vision' | 'coding';
```

**Values:**

- `fast` - Quick responses, simple tasks
- `smart` - General-purpose, balanced
- `reasoning` - Complex logic, deep thinking
- `vision` - Image understanding
- `coding` - Code generation/analysis

---

### ProviderName

Supported LLM providers.

```typescript
type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama';
```

---

### ModelMapping

Maps categories to provider-specific model names.

```typescript
interface ModelMapping {
  fast?: string;
  smart?: string;
  reasoning?: string;
  vision?: string;
  coding?: string;
}
```

**Example:**

```typescript
const models: ModelMapping = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-5-20250929',
  reasoning: 'claude-opus-4-5-20251101',
};
```

---

### ProviderConfig

Configuration for a single provider.

```typescript
interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  models: ModelMapping;
}
```

**Properties:**

| Property  | Type           | Required | Description                                    |
| --------- | -------------- | -------- | ---------------------------------------------- |
| `name`    | `ProviderName` | Yes      | Provider identifier                            |
| `apiKey`  | `string`       | No       | API authentication key                         |
| `baseUrl` | `string`       | No       | Custom API endpoint (for Ollama/local)         |
| `enabled` | `boolean`      | Yes      | Whether provider is active                     |
| `models`  | `ModelMapping` | Yes      | Category to model name mappings (at least one) |

**Example:**

```typescript
const config: ProviderConfig = {
  name: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  enabled: true,
  models: {
    fast: 'claude-haiku-4-5-20251001',
    smart: 'claude-sonnet-4-5-20250929',
  },
};
```

---

### LLMProvidersConfig

Top-level configuration object.

```typescript
interface LLMProvidersConfig {
  providers: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    google?: ProviderConfig;
    ollama?: ProviderConfig;
  };
  defaultProvider: ProviderName;
}
```

**Properties:**

| Property          | Type           | Required | Description                                   |
| ----------------- | -------------- | -------- | --------------------------------------------- |
| `providers`       | Object         | Yes      | Map of provider configurations (at least one) |
| `defaultProvider` | `ProviderName` | Yes      | Provider to use when none specified           |

**Example:**

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      enabled: true,
      models: { smart: 'claude-sonnet-4-5-20250929' },
    },
  },
  defaultProvider: 'anthropic',
};
```

## ProviderFactory

Singleton factory for creating and managing LLM providers.

### Static Methods

#### `getInstance()`

Get the singleton instance.

```typescript
static getInstance(): ProviderFactory
```

**Returns:** `ProviderFactory` - The singleton instance

**Example:**

```typescript
const factory = ProviderFactory.getInstance();
```

---

#### `resetInstance()`

Reset the singleton instance. Useful for testing.

```typescript
static resetInstance(): void
```

**Returns:** `void`

**Example:**

```typescript
ProviderFactory.resetInstance();
const newFactory = ProviderFactory.getInstance();
```

### Instance Methods

#### `initialize(config)`

Initialize the factory with configuration.

```typescript
initialize(config: unknown): void
```

**Parameters:**

| Parameter | Type      | Description                              |
| --------- | --------- | ---------------------------------------- |
| `config`  | `unknown` | Configuration object (will be validated) |

**Returns:** `void`

**Throws:** `Error` - If validation fails

**Example:**

```typescript
const factory = ProviderFactory.getInstance();
factory.initialize(config);
```

---

#### `isInitialized()`

Check if factory is initialized.

```typescript
isInitialized(): boolean
```

**Returns:** `boolean` - True if initialized

**Example:**

```typescript
if (!factory.isInitialized()) {
  factory.initialize(config);
}
```

---

#### `registerProvider(name, provider)`

Register a provider instance. Used internally by provider implementations.

```typescript
registerProvider(name: ProviderName, provider: BaseLLMProvider): void
```

**Parameters:**

| Parameter  | Type              | Description         |
| ---------- | ----------------- | ------------------- |
| `name`     | `ProviderName`    | Provider identifier |
| `provider` | `BaseLLMProvider` | Provider instance   |

**Returns:** `void`

**Example:**

```typescript
const anthropicProvider = new AnthropicProvider(config);
factory.registerProvider('anthropic', anthropicProvider);
```

---

#### `getProvider(name?)`

Get a provider instance.

```typescript
getProvider(name?: ProviderName): BaseLLMProvider
```

**Parameters:**

| Parameter | Type           | Required | Description                             |
| --------- | -------------- | -------- | --------------------------------------- |
| `name`    | `ProviderName` | No       | Provider name (uses default if omitted) |

**Returns:** `BaseLLMProvider` - Provider instance

**Throws:**

- `Error` - If factory not initialized
- `Error` - If provider not found
- `Error` - If provider is disabled

**Example:**

```typescript
// Get default provider
const provider = factory.getProvider();

// Get specific provider
const anthropic = factory.getProvider('anthropic');
const openai = factory.getProvider('openai');
```

---

#### `getModel(category, providerName?, options?)`

Get a model instance for a specific category.

```typescript
getModel(
  category: ModelCategory,
  providerName?: ProviderName,
  options?: Record<string, unknown>
): unknown
```

**Parameters:**

| Parameter      | Type                      | Required | Description                             |
| -------------- | ------------------------- | -------- | --------------------------------------- |
| `category`     | `ModelCategory`           | Yes      | Model capability category               |
| `providerName` | `ProviderName`            | No       | Provider name (uses default if omitted) |
| `options`      | `Record<string, unknown>` | No       | Provider-specific options               |

**Returns:** `unknown` - Model instance (type depends on provider)

**Throws:**

- `Error` - If factory not initialized
- `Error` - If provider not found or disabled
- `Error` - If category not supported

**Example:**

```typescript
// Get model from default provider
const model = factory.getModel('smart');

// Get model from specific provider
const anthropicModel = factory.getModel('fast', 'anthropic');
const openaiModel = factory.getModel('vision', 'openai');

// Pass provider-specific options
const modelWithOptions = factory.getModel('smart', 'anthropic', {
  temperature: 0.7,
  maxTokens: 1000,
});
```

## BaseLLMProvider

Abstract base class that all provider implementations extend.

### Properties

#### `config`

Protected property containing provider configuration.

```typescript
protected config: ProviderConfig;
```

### Constructor

```typescript
constructor(config: ProviderConfig)
```

**Parameters:**

| Parameter | Type             | Description            |
| --------- | ---------------- | ---------------------- |
| `config`  | `ProviderConfig` | Provider configuration |

### Methods

#### `getName()`

Get the provider name.

```typescript
getName(): string
```

**Returns:** `string` - Provider name

**Example:**

```typescript
const provider = factory.getProvider();
console.log(provider.getName()); // 'anthropic'
```

---

#### `isEnabled()`

Check if provider is enabled.

```typescript
isEnabled(): boolean
```

**Returns:** `boolean` - True if enabled

**Example:**

```typescript
if (provider.isEnabled()) {
  // Use provider
}
```

---

#### `getApiKey()`

Get the API key for this provider.

```typescript
getApiKey(): string | undefined
```

**Returns:** `string | undefined` - API key or undefined

**Example:**

```typescript
const hasApiKey = !!provider.getApiKey();
console.log('API Key configured:', hasApiKey);
```

---

#### `getBaseUrl()`

Get the base URL for this provider.

```typescript
getBaseUrl(): string | undefined
```

**Returns:** `string | undefined` - Base URL or undefined (uses default)

**Example:**

```typescript
const baseUrl = provider.getBaseUrl() || 'default';
console.log('Base URL:', baseUrl);
```

---

#### `getModelForCategory(category)`

Get model name for a specific category.

```typescript
getModelForCategory(category: ModelCategory): string | undefined
```

**Parameters:**

| Parameter  | Type            | Description    |
| ---------- | --------------- | -------------- |
| `category` | `ModelCategory` | Model category |

**Returns:** `string | undefined` - Model name or undefined if not supported

**Example:**

```typescript
const modelName = provider.getModelForCategory('fast');
console.log('Fast model:', modelName); // 'claude-haiku-4-5-20251001'
```

---

#### `supportsCategory(category)`

Check if provider supports a category.

```typescript
supportsCategory(category: ModelCategory): boolean
```

**Parameters:**

| Parameter  | Type            | Description    |
| ---------- | --------------- | -------------- |
| `category` | `ModelCategory` | Model category |

**Returns:** `boolean` - True if supported

**Example:**

```typescript
if (provider.supportsCategory('vision')) {
  const model = factory.getModel('vision');
} else {
  console.log('Vision not supported, using smart model');
  const model = factory.getModel('smart');
}
```

---

#### `getSupportedCategories()`

Get all supported categories.

```typescript
getSupportedCategories(): ModelCategory[]
```

**Returns:** `ModelCategory[]` - Array of supported categories

**Example:**

```typescript
const categories = provider.getSupportedCategories();
console.log('Supported:', categories.join(', '));
// Output: 'fast, smart, reasoning, coding'
```

---

#### `createModel(category, options?)` (Abstract)

Create a model instance. Must be implemented by concrete providers.

```typescript
abstract createModel(
  category: ModelCategory,
  options?: Record<string, unknown>
): unknown
```

**Parameters:**

| Parameter  | Type                      | Required | Description               |
| ---------- | ------------------------- | -------- | ------------------------- |
| `category` | `ModelCategory`           | Yes      | Model category            |
| `options`  | `Record<string, unknown>` | No       | Provider-specific options |

**Returns:** `unknown` - Model instance (type varies by provider)

---

#### `initialize()` (Abstract)

Initialize the provider. Called during setup.

```typescript
abstract initialize(): Promise<void>
```

**Returns:** `Promise<void>`

---

#### `validate()` (Abstract)

Validate provider configuration. Called before initialization.

```typescript
abstract validate(): Promise<void>
```

**Returns:** `Promise<void>`

**Throws:** `Error` - If validation fails

## Validation

### `validateLLMProvidersConfig(config)`

Validate configuration against schema.

```typescript
function validateLLMProvidersConfig(config: unknown): LLMProvidersConfig;
```

**Parameters:**

| Parameter | Type      | Description               |
| --------- | --------- | ------------------------- |
| `config`  | `unknown` | Configuration to validate |

**Returns:** `LLMProvidersConfig` - Validated configuration

**Throws:** `Error` - If validation fails (includes details)

**Example:**

```typescript
import { validateLLMProvidersConfig } from '@protolabs-ai/llm-providers';

try {
  const validConfig = validateLLMProvidersConfig(userConfig);
  factory.initialize(validConfig);
} catch (error) {
  console.error('Invalid config:', error.message);
}
```

## Error Handling

### Common Errors

#### Factory Not Initialized

```typescript
Error: ProviderFactory not initialized. Call initialize() first.
```

**Cause:** Attempting to use factory before calling `initialize()`

**Solution:**

```typescript
const factory = ProviderFactory.getInstance();
factory.initialize(config); // ← Required
```

---

#### Provider Not Found

```typescript
Error: Provider 'xyz' not found. Available providers: anthropic, openai
```

**Cause:** Requesting a provider that isn't registered

**Solution:** Check provider name spelling and ensure it's in your config

---

#### Provider Disabled

```typescript
Error: Provider 'openai' is disabled
```

**Cause:** Requesting a provider with `enabled: false`

**Solution:** Set `enabled: true` in config or choose a different provider

---

#### Category Not Supported

```typescript
Error: Provider 'anthropic' does not support category 'vision'. Supported categories: fast, smart, reasoning, coding
```

**Cause:** Requesting a category the provider doesn't support

**Solution:** Check supported categories or use a different provider

```typescript
const provider = factory.getProvider('anthropic');
if (!provider.supportsCategory('vision')) {
  // Fallback to different provider or category
  const model = factory.getModel('vision', 'openai');
}
```

---

#### Validation Error

```typescript
Error: Configuration validation failed:
  - providers.anthropic.models: At least one model category is required
```

**Cause:** Invalid configuration structure

**Solution:** Fix configuration to match schema (use TypeScript types for guidance)

### Error Handling Patterns

#### Try-Catch with Fallback

```typescript
let model;
try {
  model = factory.getModel('vision', 'anthropic');
} catch (error) {
  console.warn('Anthropic vision failed, trying OpenAI');
  model = factory.getModel('vision', 'openai');
}
```

#### Provider Failover Chain

```typescript
const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];
let model = null;

for (const provider of providers) {
  try {
    model = factory.getModel('smart', provider);
    break;
  } catch (error) {
    console.log(`${provider} failed: ${error.message}`);
  }
}

if (!model) {
  throw new Error('All providers failed');
}
```

#### Graceful Degradation

```typescript
let category: ModelCategory = 'reasoning';

try {
  model = factory.getModel(category);
} catch (error) {
  if (error.message.includes('does not support')) {
    console.log('Reasoning not available, falling back to smart');
    category = 'smart';
    model = factory.getModel(category);
  } else {
    throw error;
  }
}
```

## Usage Examples

### Basic Setup

```typescript
import { ProviderFactory } from '@protolabs-ai/llm-providers';
import type { LLMProvidersConfig } from '@protolabs-ai/llm-providers';

const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        smart: 'claude-sonnet-4-5-20250929',
      },
    },
  },
  defaultProvider: 'anthropic',
};

const factory = ProviderFactory.getInstance();
factory.initialize(config);
```

### Provider Introspection

```typescript
const provider = factory.getProvider();

console.log('Provider:', provider.getName());
console.log('Enabled:', provider.isEnabled());
console.log('Categories:', provider.getSupportedCategories());

const categories: ModelCategory[] = ['fast', 'smart', 'reasoning', 'vision', 'coding'];
categories.forEach((category) => {
  if (provider.supportsCategory(category)) {
    const modelName = provider.getModelForCategory(category);
    console.log(`${category}: ${modelName}`);
  }
});
```

### Dynamic Provider Selection

```typescript
function getModelForTask(task: string): unknown {
  const factory = ProviderFactory.getInstance();

  if (task.includes('image') || task.includes('screenshot')) {
    // Need vision capability
    try {
      return factory.getModel('vision', 'openai');
    } catch {
      return factory.getModel('smart'); // Fallback
    }
  } else if (task.includes('code')) {
    return factory.getModel('coding');
  } else if (task.includes('quick') || task.includes('simple')) {
    return factory.getModel('fast');
  } else {
    return factory.getModel('smart');
  }
}
```

### Health Check

```typescript
function checkProviderHealth(name: ProviderName): boolean {
  try {
    const provider = factory.getProvider(name);
    return provider.isEnabled() && provider.getSupportedCategories().length > 0;
  } catch {
    return false;
  }
}

const providers: ProviderName[] = ['anthropic', 'openai', 'ollama'];
const healthyProviders = providers.filter(checkProviderHealth);

console.log(`${healthyProviders.length}/${providers.length} providers available`);
```

## TypeScript Tips

### Type-Safe Configuration

```typescript
import type { LLMProvidersConfig, ModelCategory, ProviderName } from '@protolabs-ai/llm-providers';

// TypeScript will validate types
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

### Type Assertions

```typescript
// Provider-specific model types
import type { Anthropic } from '@anthropic-ai/sdk';

const model = factory.getModel('smart', 'anthropic') as Anthropic;
```

### Type Guards

```typescript
function isValidCategory(value: string): value is ModelCategory {
  return ['fast', 'smart', 'reasoning', 'vision', 'coding'].includes(value);
}

const userInput = 'fast';
if (isValidCategory(userInput)) {
  const model = factory.getModel(userInput);
}
```

## Related Documentation

- [Configuration Guide](./configuration.md) - Detailed configuration options
- [README](../README.md) - Getting started guide
- [Examples](../examples/) - Working code samples
