# Provider system

AutoMaker's server uses a pluggable provider architecture that routes each AI request to the correct backend. This page documents the architecture, lists all supported providers, and explains how to configure and extend the system.

## Architecture overview

```
apps/server/src/providers/
├── base-provider.ts       # Abstract BaseProvider class
├── provider-factory.ts    # ProviderFactory + registry + registrations
├── types.ts               # Re-exports from @protolabs-ai/types
├── claude-provider.ts     # Native Anthropic SDK (Claude)
├── cli-provider.ts        # Shared base for CLI-spawning providers
├── cursor-provider.ts     # Cursor CLI
├── codex-provider.ts      # OpenAI Codex CLI
├── opencode-provider.ts   # OpenCode CLI
├── groq-provider.ts       # Groq SDK
├── traced-provider.ts     # Langfuse tracing wrapper
├── fake-provider.ts       # Test double
└── simple-query-service.ts  # Convenience wrapper (simpleQuery / streamingQuery)
```

### BaseProvider

All provider implementations extend `BaseProvider`:

```typescript
export abstract class BaseProvider {
  abstract getName(): string;
  abstract executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage>;
  abstract detectInstallation(): Promise<InstallationStatus>;
  abstract getAvailableModels(): ModelDefinition[];

  // Concrete helpers
  validateConfig(): ValidationResult { ... }
  supportsFeature(feature: string): boolean { ... }
  getConfig(): ProviderConfig { ... }
  setConfig(config: Partial<ProviderConfig>): void { ... }
}
```

`executeQuery` is an async generator — callers iterate over `ProviderMessage` events as they stream in.

### ProviderFactory

`ProviderFactory` is the single entry point for obtaining a provider instance:

```typescript
import { ProviderFactory } from '../providers/provider-factory.js';

// Get provider for a model string
const provider = ProviderFactory.getProviderForModel('claude-sonnet-4-5-20250929');

// Or look up by name directly
const groq = ProviderFactory.getProviderByName('groq');
```

Key static methods:

| Method                             | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `getProviderForModel(modelId)`     | Resolve provider + wrap with tracing          |
| `getProviderForModelName(modelId)` | Resolve provider name only (no instantiation) |
| `getProviderByName(name)`          | Lookup by registered name or alias            |
| `getAllProviders()`                | Instantiate all registered providers          |
| `checkAllProviders()`              | Return installation status for every provider |
| `getAllAvailableModels()`          | Aggregate models from all providers           |

## Model routing

Model routing uses a **priority-ordered registry**. When a model ID arrives, `ProviderFactory` iterates registered providers from highest to lowest priority and calls each provider's `canHandleModel()` function:

| Priority | Provider | `canHandleModel` rule                                     |
| -------- | -------- | --------------------------------------------------------- |
| 10       | Cursor   | `isCursorModel(model)`                                    |
| 5        | Codex    | `isCodexModel(model)`                                     |
| 4        | Groq     | `isGroqModel(model)`                                      |
| 3        | OpenCode | `isOpencodeModel(model)`                                  |
| 0        | Claude   | starts with `claude-` or contains `opus / sonnet / haiku` |

If no provider matches, routing falls back to Claude.

**Disconnected providers:** CLI-based providers (Claude, Codex, Cursor, OpenCode) can be disconnected by the user. If a disconnected provider is selected, `getProviderForModel` throws with a message directing the user to Settings > Providers > Sign In.

## Supported providers

### Claude (native)

Runs the Anthropic Claude SDK directly. Default provider for all `claude-*` model strings.

- **Config:** `ANTHROPIC_API_KEY` environment variable or credentials stored via Settings
- **Models:** `claude-haiku-*`, `claude-sonnet-*`, `claude-opus-*`
- **Features:** vision, tools, MCP, extended thinking

### Claude-compatible (OpenAI-compatible endpoints)

Providers that expose an Anthropic-compatible API (i.e. accept the same request format as the Anthropic SDK). These are configured as `ClaudeCompatibleProvider` entries via the Settings UI and use the Claude provider's underlying SDK with a custom `baseUrl`.

Supported out-of-the-box templates:

| Template         | Base URL                             | Notes                        |
| ---------------- | ------------------------------------ | ---------------------------- |
| Direct Anthropic | `https://api.anthropic.com`          | Standard Anthropic API       |
| OpenRouter       | `https://openrouter.ai/api`          | 300+ models via proxy        |
| z.AI GLM         | `https://api.z.ai/api/anthropic`     | GLM coding models            |
| MiniMax          | `https://api.minimax.io/anthropic`   | MiniMax M2.1                 |
| MiniMax (China)  | `https://api.minimaxi.com/anthropic` | MiniMax for China region     |
| Custom           | User-supplied URL                    | Any Claude-protocol endpoint |

See [configuring OpenAI-compatible endpoints](#configuring-openai-compatible-endpoints) below.

### Cursor

Runs the Cursor CLI in headless mode.

- **Config:** Cursor must be installed and authenticated
- **Model IDs:** `cursor-gpt-4o`, `cursor-claude-3-5-sonnet`, `cursor-auto`, etc.
- **Detection:** `detectInstallation()` checks for `cursor` binary and auth state

### Codex (OpenAI)

Runs the OpenAI Codex CLI.

- **Aliases:** `openai`
- **Config:** OpenAI account configured in Codex CLI
- **Model IDs:** `codex-*` prefix or Codex-specific model strings

### OpenCode

Runs the OpenCode CLI.

- **Config:** OpenCode must be installed and configured
- **Model IDs:** `opencode-*` prefix

### Groq

Uses the Groq SDK for fast LLM inference.

- **Config:** `GROQ_API_KEY` environment variable or Settings UI
- **Model IDs:** listed in the table below

Available Groq models:

| Model ID                  | Display name            | Context | Notes                     |
| ------------------------- | ----------------------- | ------- | ------------------------- |
| `llama-3.3-70b-versatile` | Llama 3.3 70B Versatile | 128K    | **Default — recommended** |
| `llama-3.1-70b-versatile` | Llama 3.1 70B Versatile | 128K    | High performance          |
| `llama-3.1-8b-instant`    | Llama 3.1 8B Instant    | 128K    | Ultra-fast                |
| `mixtral-8x7b-32768`      | Mixtral 8x7B            | 32K     | Large context window      |
| `gemma2-9b-it`            | Gemma 2 9B IT           | 8K      | No tool support           |

A model string is recognized as Groq when it either matches a known model ID above or starts with `groq/`.

## Configuring Groq

### Option A — environment variable

Set `GROQ_API_KEY` before starting the server:

```bash
export GROQ_API_KEY=gsk_your_key_here
npm run dev:web
```

The provider reads `process.env.GROQ_API_KEY` automatically; no UI configuration is needed when this is set.

### Option B — Settings UI

1. Open **Settings → Providers**
2. Click **Add Provider → Groq**
3. Paste your API key (available at [console.groq.com/keys](https://console.groq.com/keys))
4. Select Groq models in any **Model** dropdown (they appear as `llama-3.3-70b-versatile`, etc.)

Once configured, you can set Groq models as the model for any workflow phase in **Settings → Model Configuration**.

## Configuring OpenAI-compatible endpoints

OpenAI-compatible (Claude-protocol) providers are managed in Settings.

### Adding a provider

1. Open **Settings → Providers → Add Provider**
2. Choose a template (OpenRouter, z.AI GLM, MiniMax, or Custom) or leave blank for a fully custom setup
3. Fill in:
   - **Name** — display name shown in dropdowns
   - **Base URL** — API endpoint (e.g., `https://openrouter.ai/api`)
   - **API key** — inline key, env var (`ANTHROPIC_API_KEY`), or credentials file
4. Add models — each model needs:
   - **Model ID** — sent to the API (e.g., `anthropic/claude-3.5-sonnet`)
   - **Display name** — shown in UI
   - **Maps to** — which Claude tier it replaces (`haiku / sonnet / opus`)
5. Click **Save**

The provider's models immediately appear in all Model dropdowns and Phase Model selectors.

### Using a custom endpoint

For fully custom Claude-compatible endpoints:

```json
{
  "baseUrl": "https://your-proxy.example.com/anthropic",
  "apiKeySource": "inline",
  "apiKey": "your-key",
  "useAuthToken": false,
  "models": [{ "id": "my-model", "displayName": "My Model", "mapsToClaudeModel": "sonnet" }]
}
```

This is stored in global settings under `claudeCompatibleProviders`.

## Phase model overrides

Every workflow phase (enhancement, spec generation, agent execution, etc.) has its own model slot. Phases are configured in **Settings → Model Configuration** and stored as `PhaseModelEntry` objects:

```typescript
interface PhaseModelEntry {
  model: string; // model ID or alias (haiku | sonnet | opus)
  providerId?: string; // UUID of a ClaudeCompatibleProvider (undefined = native Anthropic)
  thinkingLevel?: 'none' | 'low' | 'medium' | 'high';
}
```

### Available phase keys

| Phase key                | Default model | Purpose                         |
| ------------------------ | ------------- | ------------------------------- |
| `enhancementModel`       | sonnet        | Feature description enhancement |
| `fileDescriptionModel`   | haiku         | File context description        |
| `imageDescriptionModel`  | sonnet        | Image analysis                  |
| `validationModel`        | haiku         | Issue/PR validation             |
| `specGenerationModel`    | opus          | App spec generation             |
| `featureGenerationModel` | sonnet        | Feature generation from spec    |
| `backlogPlanningModel`   | opus          | Backlog planning                |
| `projectAnalysisModel`   | sonnet        | Project analysis                |
| `suggestionsModel`       | sonnet        | Action suggestions              |
| `memoryExtractionModel`  | haiku         | Memory extraction               |
| `commitMessageModel`     | haiku         | Commit message generation       |
| `ceremonyModel`          | opus          | Sprint ceremonies               |
| `agentExecutionModel`    | sonnet        | Auto-mode agent execution       |

### Groq and OpenAI-compatible providers as phase models

Any configured provider (including Groq and Claude-compatible providers) can be assigned to a phase:

1. In **Settings → Model Configuration**, click any phase model selector
2. The dropdown lists all available models — native Claude models plus every model from enabled providers
3. Select a Groq model (e.g., `llama-3.3-70b-versatile`) or a provider model (e.g., `GLM-4.7`)
4. Save — that phase now routes to the selected provider

**Bulk replace:** Use **Settings → Model Configuration → Bulk Replace** to swap all phases to a specific provider at once.

### Per-project overrides

Individual projects can override global phase models:

```json
{
  "phaseModelOverrides": {
    "agentExecutionModel": {
      "model": "llama-3.3-70b-versatile",
      "providerId": null
    }
  }
}
```

`getPhaseModelWithOverrides(phase, settingsService, projectPath)` checks project overrides first, falls back to global settings, then to `DEFAULT_PHASE_MODELS`.

## LangGraph flows and model injection

LangGraph flows in `libs/flows/` do not use `ProviderFactory` directly. They accept a `BaseChatModel` instance (from `@langchain/anthropic`) as a constructor or factory argument:

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { createAntagonisticReviewGraph } from '@protolabs-ai/flows';

// Resolve the model string from phase settings
const { phaseModel } = await getPhaseModelWithOverrides('agentExecutionModel', settingsService);

// Create a LangChain model instance with the resolved string
const model = new ChatAnthropic({
  model: phaseModel.model,
  temperature: 0.7,
  maxTokens: 8192,
});

// Inject the model when creating the flow
const graph = createAntagonisticReviewGraph(true);
const result = await graph.invoke({ prd, smartModel: model }, { configurable: { thread_id } });
```

To pick up model overrides in a flow:

1. Call `getPhaseModelWithOverrides(phase, settingsService, projectPath)` to resolve the effective model string
2. Instantiate `ChatAnthropic` (or `ChatGroq` for Groq models) with that string
3. Pass the model instance into the flow's input state or factory function

## Adding a new provider

1. **Create the provider class** in `apps/server/src/providers/my-provider.ts` extending `BaseProvider`:

```typescript
import { BaseProvider } from './base-provider.js';

export class MyProvider extends BaseProvider {
  getName() { return 'myprovider'; }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Implement streaming execution
    yield { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '...' }] } };
    yield { type: 'result', subtype: 'success', result: '' };
  }

  async detectInstallation(): Promise<InstallationStatus> {
    return { installed: true, method: 'sdk', hasApiKey: !!process.env.MY_API_KEY, authenticated: true };
  }

  getAvailableModels(): ModelDefinition[] {
    return [{ id: 'my-model', name: 'My Model', modelString: 'my-model', provider: 'myprovider', ... }];
  }
}
```

2. **Register in `provider-factory.ts`**:

```typescript
import { MyProvider, isMyProviderModel } from './my-provider.js';

registerProvider('myprovider', {
  factory: () => new MyProvider(),
  canHandleModel: (model) => isMyProviderModel(model),
  priority: 6, // pick a number in the priority table
});
```

3. **Export from `index.ts`**:

```typescript
export { MyProvider } from './my-provider.js';
```

4. **Add model detection helper** in `@protolabs-ai/types` if other packages need to check model strings.

## Related

- **[Shared packages](./shared-packages.md)** — package dependency chain and import rules
- **[Claude Compatible Providers](../integrations/api-key-profiles.md)** — user-facing guide for OpenAI-compatible provider setup
- **[Flows package](./flows.md)** — LangGraph state graph primitives
- **[Langfuse integration](./langfuse-integration.md)** — tracing wrapper details
