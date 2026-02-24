# Configuration Guide

Complete guide to configuring the `@protolabs-ai/llm-providers` package.

## Table of Contents

- [Overview](#overview)
- [Configuration Schema](#configuration-schema)
- [Provider Configuration](#provider-configuration)
- [Model Categories](#model-categories)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Validation](#validation)

## Overview

The LLM providers package uses a declarative configuration approach with TypeScript types and Zod validation. Configuration is passed to the `ProviderFactory` during initialization.

```typescript
import { ProviderFactory } from '@protolabs-ai/llm-providers';
import type { LLMProvidersConfig } from '@protolabs-ai/llm-providers';

const config: LLMProvidersConfig = {
  providers: {
    /* ... */
  },
  defaultProvider: 'anthropic',
};

const factory = ProviderFactory.getInstance();
factory.initialize(config);
```

## Configuration Schema

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

- `providers` - Map of provider configurations (at least one required)
- `defaultProvider` - Provider to use when none is specified

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

- `name` - Provider identifier (`'anthropic'`, `'openai'`, `'google'`, `'ollama'`)
- `apiKey` - API key (optional for testing, required for production)
- `baseUrl` - Custom API endpoint (primarily for Ollama/local models)
- `enabled` - Whether the provider is active
- `models` - Mapping of categories to model names

### ModelMapping

Maps semantic categories to provider-specific model names.

```typescript
interface ModelMapping {
  fast?: string;
  smart?: string;
  reasoning?: string;
  vision?: string;
  coding?: string;
}
```

**At least one category is required.** Define only the categories your provider supports.

## Provider Configuration

### Anthropic

```typescript
{
  name: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  enabled: true,
  models: {
    fast: 'claude-haiku-4-5-20251001',
    smart: 'claude-sonnet-4-5-20250929',
    reasoning: 'claude-opus-4-5-20251101',
    coding: 'claude-sonnet-4-5-20250929',
  },
}
```

**Supported Categories:** fast, smart, reasoning, coding

**Notes:**

- Anthropic models are named by version (haiku, sonnet, opus)
- API key format: `sk-ant-...`
- Default base URL: `https://api.anthropic.com`

### OpenAI

```typescript
{
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
}
```

**Supported Categories:** fast, smart, reasoning, vision, coding

**Notes:**

- OpenAI has the most comprehensive category support
- API key format: `sk-...`
- Default base URL: `https://api.openai.com/v1`

### Google (Gemini)

```typescript
{
  name: 'google',
  apiKey: process.env.GOOGLE_API_KEY,
  enabled: true,
  models: {
    fast: 'gemini-1.5-flash',
    balanced: 'gemini-1.5-pro',
    quality: 'gemini-1.5-pro',
  },
}
```

**Supported Categories:** fast, balanced, quality (maps to GoogleProvider's registered model keys)

**Notes:**

- Google's Gemini models via Vertex AI
- API key format varies by authentication method
- Default base URL: `https://generativelanguage.googleapis.com`

### Ollama (Local Models)

```typescript
{
  name: 'ollama',
  baseUrl: 'http://localhost:11434',
  enabled: true,
  models: {
    fast: 'llama3.2:3b',
    smart: 'llama3.1:70b',
    coding: 'codestral:latest',
  },
}
```

**Supported Categories:** fast, smart, coding

**Notes:**

- Runs locally, no API key needed
- Requires Ollama server running
- Model names use Ollama's naming scheme with tags
- Custom base URL can point to remote Ollama server

## Model Categories

Choose categories based on your use case:

### fast

**Use for:** Quick responses, simple tasks, high-volume requests

**Characteristics:**

- Fastest response time
- Lower cost
- Good for straightforward tasks

**Examples:**

- Simple text classification
- Basic content generation
- Rapid prototyping

### smart

**Use for:** General-purpose work, balanced performance

**Characteristics:**

- Good balance of speed and capability
- Most versatile
- Recommended default for production

**Examples:**

- Code generation
- Documentation writing
- Complex text analysis

### reasoning

**Use for:** Deep thinking, complex logic, challenging problems

**Characteristics:**

- Highest capability
- Slower response time
- Higher cost
- Best for difficult tasks

**Examples:**

- Architectural decisions
- Complex debugging
- Multi-step reasoning

### vision

**Use for:** Image understanding and analysis

**Characteristics:**

- Accepts image inputs
- Multimodal capabilities
- Not all providers support this

**Examples:**

- Screenshot analysis
- Diagram interpretation
- Visual debugging

### coding

**Use for:** Code-specific tasks

**Characteristics:**

- Optimized for code generation
- Better syntax understanding
- Some providers use same model as 'smart'

**Examples:**

- Code completion
- Refactoring
- Test generation

## Environment Variables

### Recommended Approach

Store API keys in environment variables:

```bash
# .env file
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
```

Reference in configuration:

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: !!process.env.ANTHROPIC_API_KEY, // Auto-enable if key present
      models: {
        /* ... */
      },
    },
  },
  defaultProvider: 'anthropic',
};
```

### Loading Environment Variables

```typescript
import { config as loadEnv } from 'dotenv';
loadEnv(); // Loads .env file

const factory = ProviderFactory.getInstance();
factory.initialize(config);
```

## Configuration Examples

### Minimal Configuration

Single provider, single category:

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      enabled: true,
      models: {
        smart: 'claude-sonnet-4-5-20250929',
      },
    },
  },
  defaultProvider: 'anthropic',
};
```

### Multi-Provider Configuration

Multiple providers with fallback:

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: !!process.env.ANTHROPIC_API_KEY,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        smart: 'claude-sonnet-4-5-20250929',
        reasoning: 'claude-opus-4-5-20251101',
      },
    },
    openai: {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      enabled: !!process.env.OPENAI_API_KEY,
      models: {
        fast: 'gpt-4o-mini',
        smart: 'gpt-4o',
        vision: 'gpt-4o',
      },
    },
    ollama: {
      name: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      enabled: true, // Always enabled (local)
      models: {
        fast: 'llama3.2:3b',
        smart: 'llama3.1:70b',
      },
    },
  },
  defaultProvider: process.env.DEFAULT_PROVIDER || 'anthropic',
};
```

### Development vs Production

```typescript
const isDev = process.env.NODE_ENV === 'development';

const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: !isDev || !!process.env.ANTHROPIC_API_KEY,
      models: {
        fast: isDev ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5-20250929',
        smart: 'claude-sonnet-4-5-20250929',
        reasoning: 'claude-opus-4-5-20251101',
      },
    },
    ollama: {
      name: 'ollama',
      enabled: isDev, // Only in development
      models: {
        fast: 'llama3.2:3b',
        smart: 'llama3.1:70b',
      },
    },
  },
  defaultProvider: isDev ? 'ollama' : 'anthropic',
};
```

### Dynamic Configuration from File

```typescript
import { readFileSync } from 'fs';

interface ConfigFile {
  defaultProvider: string;
  providers: Array<{
    name: string;
    enabled: boolean;
    apiKey?: string;
    models: Record<string, string>;
  }>;
}

function loadConfig(path: string): LLMProvidersConfig {
  const raw: ConfigFile = JSON.parse(readFileSync(path, 'utf-8'));

  const config: LLMProvidersConfig = {
    providers: {},
    defaultProvider: raw.defaultProvider as ProviderName,
  };

  for (const provider of raw.providers) {
    config.providers[provider.name as ProviderName] = {
      name: provider.name as ProviderName,
      enabled: provider.enabled,
      apiKey: provider.apiKey,
      models: provider.models as ModelMapping,
    };
  }

  return config;
}

const config = loadConfig('./llm-config.json');
```

## Validation

Configuration is validated using Zod schemas. Validation errors are clear and actionable.

### Common Validation Errors

**Missing required field:**

```
Error: Configuration validation failed:
  - providers: Required
  - defaultProvider: Required
```

**Invalid provider name:**

```
Error: Configuration validation failed:
  - providers.unknown: Invalid provider name. Must be one of: anthropic, openai, google, ollama
```

**No models defined:**

```
Error: Configuration validation failed:
  - providers.anthropic.models: At least one model category is required
```

**Invalid model category:**

```
Error: Configuration validation failed:
  - providers.anthropic.models.unknown: Invalid category. Must be one of: fast, smart, reasoning, vision, coding
```

### Validation in Code

```typescript
import { validateLLMProvidersConfig } from '@protolabs-ai/llm-providers';

try {
  const validConfig = validateLLMProvidersConfig(config);
  factory.initialize(validConfig);
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}
```

### Type Checking

Use TypeScript to catch configuration errors at compile time:

```typescript
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001',
        invalid: 'test', // ❌ TypeScript error: invalid category
      },
    },
  },
  defaultProvider: 'unknown', // ❌ TypeScript error: invalid provider
};
```

## Best Practices

### 1. Use Environment Variables for Secrets

✅ **Good:**

```typescript
apiKey: process.env.ANTHROPIC_API_KEY,
```

❌ **Bad:**

```typescript
apiKey: 'sk-ant-api03-...',  // Hardcoded secret!
```

### 2. Enable Providers Conditionally

```typescript
enabled: !!process.env.ANTHROPIC_API_KEY,  // Only enable if key is set
```

### 3. Provide Fallbacks

```typescript
baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
defaultProvider: process.env.DEFAULT_PROVIDER || 'anthropic',
```

### 4. Define Multiple Categories

Provide flexibility for different use cases:

```typescript
models: {
  fast: 'claude-haiku-4-5-20251001',    // For quick tasks
  smart: 'claude-sonnet-4-5-20250929',   // For general work
  reasoning: 'claude-opus-4-5-20251101', // For complex problems
}
```

### 5. Document Custom Configurations

```typescript
// Custom config for cost optimization
// Uses fast models by default, reasoning only when explicitly requested
const config: LLMProvidersConfig = {
  providers: {
    anthropic: {
      name: 'anthropic',
      enabled: true,
      models: {
        fast: 'claude-haiku-4-5-20251001', // Primary model
        reasoning: 'claude-opus-4-5-20251101', // Fallback for hard tasks
      },
    },
  },
  defaultProvider: 'anthropic',
};
```

## Troubleshooting

### Provider Not Loading

**Problem:** Provider appears configured but isn't available

**Solution:** Check that `enabled: true` is set and API key is valid

```typescript
const provider = factory.getProvider('anthropic');
console.log('Enabled:', provider.isEnabled());
console.log('API Key:', provider.getApiKey() ? 'Set' : 'Missing');
```

### Model Not Found

**Problem:** Category exists but model creation fails

**Solution:** Verify the model name matches provider's naming scheme

```typescript
// Check what model name is configured
const provider = factory.getProvider('anthropic');
console.log('Fast model:', provider.getModelForCategory('fast'));
```

### Validation Errors

**Problem:** Configuration fails validation

**Solution:** Use TypeScript types and check error messages

```typescript
// Let TypeScript guide you
const config: LLMProvidersConfig = {
  // TypeScript will show required fields and valid values
};
```

## Related Documentation

- [API Reference](./api-reference.md) - Complete API documentation
- [README](../README.md) - Getting started guide
- [Examples](../examples/) - Working code samples
