# Provider Architecture Reference

This document describes the modular provider architecture in `apps/server/src/providers/` that enables support for multiple AI model providers (Claude SDK, OpenAI Codex CLI, Cursor, OpenCode, and more).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Provider Interface](#provider-interface)
3. [Available Providers](#available-providers)
4. [Provider Factory](#provider-factory)
5. [Adding New Providers](#adding-new-providers)
6. [Provider Types](#provider-types)
7. [Best Practices](#best-practices)

---

## Architecture Overview

The provider architecture separates AI model execution logic from business logic, enabling clean abstraction and easy extensibility.

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│         AgentService / AutoModeService   │
│              (No provider logic)         │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────▼──────────┐
         │  ProviderFactory   │  Registry-based routing
         │  (Routes by model) │  "claude-*" → Claude
         └─────────┬──────────┘  "gpt-*" → Codex
                   │              "cursor-*" → Cursor
      ┌────────────┼────────────┐ "opencode-*" → OpenCode
      │            │            │
┌─────▼──────┐ ┌──▼──────┐ ┌──▼──────────┐
│   Claude   │ │  Codex  │ │ Cursor /    │
│  Provider  │ │ Provider│ │ OpenCode    │
│ (Agent SDK)│ │ (CLI)   │ │ (CLI)       │
└────────────┘ └─────────┘ └─────────────┘
                   │
            ┌──────▼──────┐
            │   Traced    │  (Langfuse wrapper,
            │  Provider   │   wraps any provider)
            └─────────────┘
```

### Key Benefits

- ✅ **Adding new providers**: Create provider file + register in factory
- ✅ **Services remain clean**: No provider-specific logic
- ✅ **All providers implement same interface**: Consistent behavior
- ✅ **Registry pattern**: Providers self-register with model matching functions
- ✅ **Traced wrapper**: Langfuse observability wraps any provider transparently
- ✅ **Easy to test**: Each provider can be tested independently

---

## Provider Interface

**Location**: `apps/server/src/providers/base-provider.ts`

All providers must extend `BaseProvider` and implement the required methods.

### BaseProvider Abstract Class

```typescript
export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
  }

  /**
   * Get provider name (e.g., "claude", "codex")
   */
  abstract getName(): string;

  /**
   * Execute a query and stream responses
   */
  abstract executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage>;

  /**
   * Detect provider installation status
   */
  abstract detectInstallation(): Promise<InstallationStatus>;

  /**
   * Get available models for this provider
   */
  abstract getAvailableModels(): ModelDefinition[];

  /**
   * Check if provider supports a specific feature (optional)
   */
  supportsFeature(feature: string): boolean {
    return false;
  }
}
```

### Shared Types

**Location**: `apps/server/src/providers/types.ts`

#### ExecuteOptions

Input configuration for executing queries:

```typescript
export interface ExecuteOptions {
  prompt: string | Array<{ type: string; text?: string; source?: object }>;
  model: string;
  cwd: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, unknown>;
  abortController?: AbortController;
  conversationHistory?: ConversationMessage[];
}
```

#### ProviderMessage

Output messages streamed from providers:

```typescript
export interface ProviderMessage {
  type: 'assistant' | 'user' | 'error' | 'result';
  subtype?: 'success' | 'error';
  message?: {
    role: 'user' | 'assistant';
    content: ContentBlock[];
  };
  result?: string;
  error?: string;
}
```

#### ContentBlock

Individual content blocks in messages:

```typescript
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'thinking' | 'tool_result';
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}
```

---

## Available Providers

### 1. Claude Provider (SDK-based)

**Location**: `apps/server/src/providers/claude-provider.ts`

Uses `@anthropic-ai/claude-agent-sdk` for direct SDK integration.

#### Features

- ✅ Native multi-turn conversation support
- ✅ Vision support (images)
- ✅ Tool use (Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch)
- ✅ Thinking blocks (extended thinking)
- ✅ Streaming responses
- ✅ No CLI installation required (npm dependency)

#### Model Detection

Routes models that:

- Start with `"claude-"` (e.g., `"claude-opus-4-5-20251101"`)
- Are Claude aliases: `"opus"`, `"sonnet"`, `"haiku"`

#### Authentication

Requires:

- `ANTHROPIC_API_KEY` environment variable

#### Example Usage

```typescript
const provider = new ClaudeProvider();

const stream = provider.executeQuery({
  prompt: 'What is 2+2?',
  model: 'claude-opus-4-5-20251101',
  cwd: '/project/path',
  systemPrompt: 'You are a helpful assistant.',
  maxTurns: 20,
  allowedTools: ['Read', 'Write', 'Bash'],
  abortController: new AbortController(),
  conversationHistory: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help?' },
  ],
});

for await (const msg of stream) {
  if (msg.type === 'assistant') {
    console.log(msg.message?.content);
  }
}
```

#### Conversation History Handling

Uses `convertHistoryToMessages()` utility to convert history to SDK format:

```typescript
const historyMessages = convertHistoryToMessages(conversationHistory);
for (const msg of historyMessages) {
  yield msg; // Yield to SDK
}
```

---

### 2. Codex Provider (CLI-based)

**Location**: `apps/server/src/providers/codex-provider.ts`

Spawns OpenAI Codex CLI as a subprocess and converts JSONL output to provider format.

#### Features

- ✅ Subprocess execution (`codex exec --model <model> --json --full-auto`)
- ✅ JSONL stream parsing
- ✅ Supports GPT-5.1/5.2 Codex models
- ✅ Vision support (GPT-5.1, GPT-5.2)
- ✅ Tool use via MCP servers
- ✅ Timeout detection (30s no output)
- ✅ Abort signal handling

#### Model Detection

Routes models that:

- Start with `"gpt-"` (e.g., `"gpt-5.2"`, `"gpt-5.1-codex-max"`)
- Start with `"o"` (e.g., `"o1"`, `"o1-mini"`)

#### Available Models

| Model                | Description        | Context | Max Output | Vision |
| -------------------- | ------------------ | ------- | ---------- | ------ |
| `gpt-5.2`            | Latest Codex model | 256K    | 32K        | Yes    |
| `gpt-5.1-codex-max`  | Maximum capability | 256K    | 32K        | Yes    |
| `gpt-5.1-codex`      | Standard Codex     | 256K    | 32K        | Yes    |
| `gpt-5.1-codex-mini` | Lightweight        | 256K    | 16K        | No     |
| `gpt-5.1`            | General-purpose    | 256K    | 32K        | Yes    |

#### Authentication

Supports two methods:

1. **CLI login**: `codex login` (OAuth tokens stored in `~/.codex/auth.json`)
2. **API key**: `OPENAI_API_KEY` environment variable

#### Installation Detection

Uses `CodexCliDetector` to check:

- PATH for `codex` command
- npm global: `npm list -g @openai/codex`
- Homebrew (macOS): `/opt/homebrew/bin/codex`
- Common paths: `~/.local/bin/codex`, `/usr/local/bin/codex`

#### Example Usage

```typescript
const provider = new CodexProvider();

const stream = provider.executeQuery({
  prompt: 'Fix the bug in main.ts',
  model: 'gpt-5.2',
  cwd: '/project/path',
  systemPrompt: 'You are an expert TypeScript developer.',
  abortController: new AbortController(),
});

for await (const msg of stream) {
  if (msg.type === 'assistant') {
    console.log(msg.message?.content);
  } else if (msg.type === 'error') {
    console.error(msg.error);
  }
}
```

#### JSONL Event Conversion

Codex CLI outputs JSONL events that get converted to `ProviderMessage` format:

| Codex Event                          | Provider Message                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `item.completed` (reasoning)         | `{ type: "assistant", content: [{ type: "thinking" }] }`                                |
| `item.completed` (agent_message)     | `{ type: "assistant", content: [{ type: "text" }] }`                                    |
| `item.completed` (command_execution) | `{ type: "assistant", content: [{ type: "text", text: "```bash\n...\n```" }] }`         |
| `item.started` (command_execution)   | `{ type: "assistant", content: [{ type: "tool_use" }] }`                                |
| `item.updated` (todo_list)           | `{ type: "assistant", content: [{ type: "text", text: "**Updated Todo List:**..." }] }` |
| `thread.completed`                   | `{ type: "result", subtype: "success" }`                                                |
| `error`                              | `{ type: "error", error: "..." }`                                                       |

#### Conversation History Handling

Uses `formatHistoryAsText()` utility to prepend history as text context (CLI doesn't support native multi-turn):

```typescript
const historyText = formatHistoryAsText(conversationHistory);
combinedPrompt = `${historyText}Current request:\n${combinedPrompt}`;
```

#### MCP Server Configuration

**Location**: `apps/server/src/providers/codex-config-manager.ts`

Manages TOML configuration for MCP servers:

```typescript
await codexConfigManager.configureMcpServer(cwd, mcpServerScriptPath);
```

Generates `.codex/config.toml`:

```toml
[mcp_servers.automaker-tools]
command = "node"
args = ["/path/to/mcp-server.js"]
enabled_tools = ["UpdateFeatureStatus"]
```

---

## Provider Factory

**Location**: `apps/server/src/providers/provider-factory.ts`

Routes requests to the appropriate provider based on model string.

### Registry-Based Routing

The factory uses a registry pattern where providers self-register with model matching functions:

```typescript
// Provider registration (happens on import)
registerProvider('claude', {
  factory: () => new ClaudeProvider(),
  canHandleModel: (model) =>
    model.startsWith('claude-') || ['haiku', 'sonnet', 'opus'].includes(model),
  priority: 10,
});

registerProvider('codex', {
  factory: () => new CodexProvider(),
  canHandleModel: (model) => isCodexModel(model),
});

registerProvider('cursor', {
  factory: () => new CursorProvider(),
  canHandleModel: (model) => isCursorModel(model),
});

registerProvider('opencode', {
  factory: () => new OpencodeProvider(),
  canHandleModel: (model) => isOpencodeModel(model),
});

// Factory routes by checking each provider's canHandleModel()
export class ProviderFactory {
  static getProviderForModel(model: string): BaseProvider {
    // Iterates registered providers sorted by priority (highest first)
    // Returns first match, or defaults to Claude
  }
}
```

When Langfuse is configured, the factory automatically wraps providers in `TracedProvider` for observability.

### Usage in Services

```typescript
import { ProviderFactory } from '../providers/provider-factory.js';

// In AgentService or AutoModeService
const provider = ProviderFactory.getProviderForModel(model);
const stream = provider.executeQuery(options);

for await (const msg of stream) {
  // Handle messages (format is consistent across all providers)
}
```

---

## Adding New Providers

### Step 1: Create Provider File

Create `apps/server/src/providers/[name]-provider.ts`:

```typescript
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

export class CursorProvider extends BaseProvider {
  getName(): string {
    return 'cursor';
  }

  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    // Implementation here
    // 1. Spawn cursor CLI or use SDK
    // 2. Convert output to ProviderMessage format
    // 3. Yield messages
  }

  async detectInstallation(): Promise<InstallationStatus> {
    // Check if cursor is installed
    // Return { installed: boolean, path?: string, version?: string }
  }

  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'cursor-premium',
        name: 'Cursor Premium',
        modelString: 'cursor-premium',
        provider: 'cursor',
        description: "Cursor's premium model",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium',
        default: true,
      },
    ];
  }

  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision'];
    return supportedFeatures.includes(feature);
  }
}
```

### Step 2: Register in Factory

Register your provider in `apps/server/src/providers/provider-factory.ts`:

```typescript
import { MyProvider } from './my-provider.js';

registerProvider('my-provider', {
  factory: () => new MyProvider(),
  canHandleModel: (model) => model.startsWith('my-'),
  priority: 5, // Higher = checked first
});
```

### Step 3: Update Models List

Update `apps/server/src/routes/models.ts`:

```typescript
{
  id: "cursor-premium",
  name: "Cursor Premium",
  provider: "cursor",
  contextWindow: 200000,
  maxOutputTokens: 8192,
  supportsVision: true,
  supportsTools: true,
}
```

### Step 4: Done!

No changes needed in:

- ✅ AgentService
- ✅ AutoModeService
- ✅ Any business logic

The provider architecture handles everything automatically.

---

## Provider Types

### SDK-Based Providers (like Claude)

**Characteristics**:

- Direct SDK/library integration
- No subprocess spawning
- Native multi-turn support
- Streaming via async generators

**Example**: ClaudeProvider using `@anthropic-ai/claude-agent-sdk`

**Advantages**:

- Lower latency
- More control over options
- Easier error handling
- No CLI installation required

---

### CLI-Based Providers (like Codex)

**Characteristics**:

- Subprocess spawning
- JSONL stream parsing
- Text-based conversation history
- Requires CLI installation

**Example**: CodexProvider using `codex exec --json`

**Advantages**:

- Access to CLI-only features
- No SDK dependency
- Can use any CLI tool

**Implementation Pattern**:

1. Use `spawnJSONLProcess()` from `subprocess-manager.ts`
2. Convert JSONL events to `ProviderMessage` format
3. Handle authentication (CLI login or API key)
4. Implement timeout detection

---

## Best Practices

### 1. Message Format Consistency

All providers MUST output the same `ProviderMessage` format so services can handle them uniformly:

```typescript
// ✅ Correct - Consistent format
yield {
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "Response" }]
  }
};

// ❌ Incorrect - Provider-specific format
yield {
  customType: "response",
  data: "Response"
};
```

### 2. Error Handling

Always yield error messages, never throw:

```typescript
// ✅ Correct
try {
  // ...
} catch (error) {
  yield {
    type: "error",
    error: (error as Error).message
  };
  return;
}

// ❌ Incorrect
throw new Error("Provider failed");
```

### 3. Abort Signal Support

Respect the abort controller:

```typescript
if (abortController?.signal.aborted) {
  yield { type: "error", error: "Operation cancelled" };
  return;
}
```

### 4. Conversation History

- **SDK providers**: Use `convertHistoryToMessages()` and yield messages
- **CLI providers**: Use `formatHistoryAsText()` and prepend to prompt

### 5. Image Handling

- **Vision models**: Pass images as content blocks
- **Non-vision models**: Extract text only using utilities

### 6. Logging

Use consistent logging prefixes:

```typescript
console.log(`[${this.getName()}Provider] Operation started`);
console.error(`[${this.getName()}Provider] Error:`, error);
```

### 7. Installation Detection

Implement thorough detection:

- Check multiple installation methods
- Verify authentication
- Return detailed status

### 8. Model Definitions

Provide accurate model metadata:

```typescript
{
  id: "model-id",
  name: "Human-readable name",
  modelString: "exact-model-string",
  provider: "provider-name",
  description: "What this model is good for",
  contextWindow: 200000,
  maxOutputTokens: 8192,
  supportsVision: true,
  supportsTools: true,
  tier: "premium" | "standard" | "basic",
  default: false
}
```

---

## Testing Providers

### Unit Tests

Test each provider method independently:

```typescript
describe('ClaudeProvider', () => {
  it('should detect installation', async () => {
    const provider = new ClaudeProvider();
    const status = await provider.detectInstallation();

    expect(status.installed).toBe(true);
    expect(status.method).toBe('sdk');
  });

  it('should stream messages correctly', async () => {
    const provider = new ClaudeProvider();
    const messages = [];

    for await (const msg of provider.executeQuery(options)) {
      messages.push(msg);
    }

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].type).toBe('assistant');
  });
});
```

### Integration Tests

Test provider interaction with services:

```typescript
describe('Provider Integration', () => {
  it('should work with AgentService', async () => {
    const provider = ProviderFactory.getProviderForModel('claude-opus-4-5-20251101');

    // Test full workflow
  });
});
```

---

## Environment Variables

### Claude Provider

```bash
# Required:
ANTHROPIC_API_KEY=sk-ant-...
```

### Codex Provider

```bash
# Required (one of):
OPENAI_API_KEY=sk-...
# OR run: codex login

# Optional:
CODEX_CLI_PATH=/custom/path/to/codex
```

---

## Troubleshooting

### Provider Not Found

**Problem**: `ProviderFactory.getProviderForModel()` returns wrong provider

**Solution**: Check model string prefix in factory routing

### Authentication Errors

**Problem**: Provider fails with auth error

**Solution**:

1. Check environment variables
2. For CLI providers, verify CLI login status
3. Check `detectInstallation()` output

### JSONL Parsing Errors (CLI providers)

**Problem**: Failed to parse JSONL line

**Solution**:

1. Check CLI output format
2. Verify JSON is valid
3. Add error handling for malformed lines

### Timeout Issues (CLI providers)

**Problem**: Subprocess hangs

**Solution**:

1. Increase timeout in `spawnJSONLProcess` options
2. Check CLI process for hangs
3. Verify abort signal handling

---

### 3. Cursor Provider (CLI-based)

**Location**: `apps/server/src/providers/cursor-provider.ts`

Uses the Cursor CLI as a subprocess for code-focused AI interactions. Extends `CliProvider` base class for CLI spawn management.

#### Features

- Subprocess execution via `CliProvider` spawn strategy
- CLI configuration managed by `CursorConfigManager`
- Model detection for `cursor-*` prefixed models

#### Configuration

**Location**: `apps/server/src/providers/cursor-config-manager.ts`

### 4. OpenCode Provider (CLI-based)

**Location**: `apps/server/src/providers/opencode-provider.ts`

Open-source model provider via CLI subprocess.

#### Features

- CLI-based execution
- Model detection for `opencode-*` prefixed models

### 5. Groq Provider (SDK-based)

**Location**: `apps/server/src/providers/groq-provider.ts`

Uses the `groq-sdk` for streaming completions from Groq's fast inference API.

#### Features

- ✅ Native SDK integration (no CLI required)
- ✅ Streaming responses via `groq-sdk` chat completions
- ✅ Conversation history support (prepended as chat messages)
- ✅ Llama and Mixtral model families

#### Model Detection

Routes models that:

- Start with `"groq/"` (e.g., `"groq/llama-3.3-70b-versatile"`)
- Are known Groq model IDs: `llama-3.3-70b-versatile`, `llama-3.1-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `gemma2-9b-it`

#### Available Models

| Model                     | Description                | Context |
| ------------------------- | -------------------------- | ------- |
| `llama-3.3-70b-versatile` | Latest Llama 3.3 (default) | 128K    |
| `llama-3.1-70b-versatile` | Llama 3.1 70B              | 128K    |
| `llama-3.1-8b-instant`    | Fast, lightweight          | 128K    |
| `mixtral-8x7b-32768`      | Mixtral MoE                | 32K     |
| `gemma2-9b-it`            | Google Gemma 2 9B          | 8K      |

#### Authentication

Requires:

- `GROQ_API_KEY` environment variable (or `config.apiKey` in provider settings)

### 7. Traced Provider (Langfuse Wrapper)

**Location**: `apps/server/src/providers/traced-provider.ts`

Wraps any other provider with Langfuse tracing for observability. Not a standalone provider — it decorates an existing provider to add cost tracking, latency measurement, and trace collection.

### 8. Fake Provider (Testing)

**Location**: `apps/server/src/providers/fake-provider.ts`

Mock provider for testing. Returns deterministic responses without making real API calls. Used in CI/E2E tests via `AUTOMAKER_MOCK_AGENT=true`.

### 9. CLI Provider (Base Class)

**Location**: `apps/server/src/providers/cli-provider.ts`

Abstract base class for CLI-based providers (Codex, Cursor, OpenCode). Provides common subprocess spawning, JSONL parsing, and abort signal handling. Providers extend this instead of `BaseProvider` directly when they wrap a CLI tool.

---

## Future Provider Ideas

Potential providers to add:

1. **Gemini Provider** (`gemini-*`)
   - Google's AI models
   - SDK-based via `@google/generative-ai`

2. **Ollama Provider** (`ollama-*`)
   - Local model hosting
   - CLI or HTTP API

Each would follow the same pattern:

1. Create `[name]-provider.ts` extending `BaseProvider` (SDK) or `CliProvider` (CLI)
2. Register via `registerProvider()` in `provider-factory.ts`
3. Update models list
4. Done!
