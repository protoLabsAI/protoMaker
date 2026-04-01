# Proto Agent SDK Reference

Complete API reference for the `@qwen-code/sdk` package. This covers every exported function, type, and class. Use this page to look up signatures, option fields, and message shapes.

## `query()`

```typescript
function query(params: { prompt: string; options?: QueryOptions }): Query;
```

Spawns the Proto CLI as a subprocess and returns a `Query` object. The `Query` is an async iterable that yields SDK messages as the agent works. The subprocess communicates over JSON-Lines on stdin/stdout.

**Parameters:**

| Field     | Type           | Description                            |
| --------- | -------------- | -------------------------------------- |
| `prompt`  | `string`       | The user message to send to the agent  |
| `options` | `QueryOptions` | Optional configuration for the session |

**Returns:** `Query` -- an async iterable of `SDKMessage` events.

## `QueryOptions`

All fields are optional.

| Field                    | Type                                                         | Default            | Description                                                                     |
| ------------------------ | ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                                     | `process.cwd()`    | Working directory for the subprocess                                            |
| `model`                  | `string`                                                     | CLI default        | Model identifier or alias to use                                                |
| `pathToQwenExecutable`   | `string`                                                     | Resolved from PATH | Absolute path to the `proto` CLI binary                                         |
| `env`                    | `Record<string, string>`                                     | `process.env`      | Environment variables passed to the subprocess                                  |
| `systemPrompt`           | `string`                                                     | CLI default        | System prompt prepended to the conversation                                     |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'`               | `'default'`        | Controls which tool calls require approval                                      |
| `canUseTool`             | `CanUseTool`                                                 | Auto-deny          | Callback for custom tool permission decisions (see types)                       |
| `mcpServers`             | `Record<string, McpServerConfig>`                            | `{}`               | MCP servers to connect to during the session                                    |
| `abortController`        | `AbortController`                                            | None               | Controller to cancel the running query                                          |
| `debug`                  | `boolean`                                                    | `false`            | Enable verbose subprocess logging                                               |
| `stderr`                 | `(message: string) => void`                                  | --                 | Custom handler for subprocess stderr output                                     |
| `logLevel`               | `'debug' \| 'info' \| 'warn' \| 'error'`                     | `'error'`          | Minimum log level for SDK-internal logging                                      |
| `maxSessionTurns`        | `number`                                                     | Unlimited          | Maximum number of agent turns before auto-stop                                  |
| `coreTools`              | `string[]`                                                   | All core tools     | Allowlist of core tools the agent can use                                       |
| `excludeTools`           | `string[]`                                                   | `[]`               | Tools to remove from the agent's toolset                                        |
| `allowedTools`           | `string[]`                                                   | All available      | Explicit allowlist of tools (overrides defaults)                                |
| `authType`               | `AuthType`                                                   | CLI default        | Auth type: `'openai'`, `'anthropic'`, `'qwen-oauth'`, `'gemini'`, `'vertex-ai'` |
| `agents`                 | `SubagentConfig[]`                                           | `[]`               | Subagent definitions the agent can delegate to                                  |
| `includePartialMessages` | `boolean`                                                    | `false`            | Yield `stream_event` messages during generation                                 |
| `resume`                 | `string`                                                     | --                 | Session ID to resume. Loads prior conversation context                          |
| `sessionId`              | `string`                                                     | Auto-generated     | Explicit session ID for SDK-CLI alignment                                       |
| `hooks`                  | `boolean`                                                    | `false`            | Enable the hook system (auto-enabled when `hookCallbacks` is set)               |
| `extensions`             | `string[]`                                                   | `[]`               | Extension names to enable for the session                                       |
| `includeDirs`            | `string[]`                                                   | `[]`               | Additional directories to include in the workspace                              |
| `sandbox`                | `boolean`                                                    | `false`            | Run the subprocess in a sandboxed environment                                   |
| `chatRecording`          | `boolean`                                                    | `true`             | Session persistence. Set to `false` to disable                                  |
| `webSearch`              | `WebSearchConfig`                                            | --                 | Web search API keys and provider config (see below)                             |
| `hookCallbacks`          | `Partial<Record<HookEvent, HookCallback \| HookCallback[]>>` | `{}`               | Hook callbacks keyed by event name                                              |
| `timeout`                | `TimeoutConfig`                                              | See below          | Timeout overrides for SDK operations                                            |

## Message Types

Every message yielded by the `Query` async iterable has a `type` discriminator field.

### `SDKUserMessage`

```typescript
interface SDKUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
}
```

Echoes back the user prompt that started the turn.

### `SDKAssistantMessage`

```typescript
interface SDKAssistantMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: string;
    toolCalls?: ToolCall[];
  };
  sessionId: string;
}
```

A complete assistant response for one turn. The `content` field contains the full text. If the agent invoked tools, `toolCalls` lists each invocation with its name, input, and result.

### `SDKPartialAssistantMessage`

```typescript
interface SDKPartialAssistantMessage {
  type: 'partial_assistant';
  message: {
    role: 'assistant';
    content: string;
  };
}
```

Incremental text as the model generates it. Only yielded when `includePartialMessages: true`. The `content` field contains the cumulative text so far.

### `SDKSystemMessage`

```typescript
interface SDKSystemMessage {
  type: 'system';
  message: {
    content: string;
    level: 'info' | 'warn' | 'error';
  };
}
```

Diagnostic messages from the CLI subprocess. Not part of the conversation history.

### `SDKResultMessage`

```typescript
interface SDKResultMessage {
  type: 'result';
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  sessionId: string;
  duration: number;
}
```

Emitted once when the query completes. Contains cost and usage metrics for the entire session.

## Event Types

Events represent side effects or state changes during agent execution.

### `SDKTaskEvent`

```typescript
interface SDKTaskEvent {
  type: 'event';
  event: 'task';
  taskId: string;
  taskName: string;
  status: 'started' | 'completed' | 'failed';
  error?: string;
}
```

Fired when the agent starts, completes, or fails a discrete task (tool call, file operation, etc.).

### `SDKMemoryEvent`

```typescript
interface SDKMemoryEvent {
  type: 'event';
  event: 'memory';
  action: 'read' | 'write';
  path: string;
  content?: string;
}
```

Fired when the agent reads or writes a memory file (e.g., `CLAUDE.md`, `.automaker/memory/`).

## Type Guards

The SDK exports type guard functions to narrow the `SDKMessage` union in conditional branches.

```typescript
import {
  isSDKAssistantMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
  isSDKSystemMessage,
  isSDKUserMessage,
  isTaskEvent,
  isMemoryEvent,
} from '@qwen-code/sdk';
```

| Guard                               | Narrows To                   | Checks                                           |
| ----------------------------------- | ---------------------------- | ------------------------------------------------ |
| `isSDKAssistantMessage(msg)`        | `SDKAssistantMessage`        | `msg.type === 'assistant'`                       |
| `isSDKResultMessage(msg)`           | `SDKResultMessage`           | `msg.type === 'result'`                          |
| `isSDKPartialAssistantMessage(msg)` | `SDKPartialAssistantMessage` | `msg.type === 'partial_assistant'`               |
| `isSDKSystemMessage(msg)`           | `SDKSystemMessage`           | `msg.type === 'system'`                          |
| `isSDKUserMessage(msg)`             | `SDKUserMessage`             | `msg.type === 'user'`                            |
| `isTaskEvent(msg)`                  | `SDKTaskEvent`               | `msg.type === 'event' && msg.event === 'task'`   |
| `isMemoryEvent(msg)`                | `SDKMemoryEvent`             | `msg.type === 'event' && msg.event === 'memory'` |

All guards are runtime checks that return a boolean type predicate. They work in `if` blocks, `filter()`, and any context where TypeScript narrows types.

## Hook Types

### `HookEvent`

```typescript
type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreAssistantResponse'
  | 'PostAssistantResponse'
  | 'SessionStart'
  | 'SessionEnd';
```

The six lifecycle points where hooks can intercept execution.

| Event                   | Fires When                            |
| ----------------------- | ------------------------------------- |
| `PreToolUse`            | Before a tool call executes           |
| `PostToolUse`           | After a tool call completes           |
| `PreAssistantResponse`  | Before the model generates a response |
| `PostAssistantResponse` | After the model finishes a response   |
| `SessionStart`          | When the session initializes          |
| `SessionEnd`            | When the session terminates           |

### `HookCallback`

```typescript
type HookCallback = (
  input: unknown,
  toolUseId: string | null
) => Promise<HookCallbackResult> | HookCallbackResult;
```

Called when a hook event fires. `input` contains the event payload (tool name, tool input, etc.). `toolUseId` identifies the tool invocation, if applicable. May return synchronously or as a promise.

### `HookCallbackResult`

```typescript
interface HookCallbackResult {
  shouldSkip?: boolean;
  shouldInterrupt?: boolean;
  suppressOutput?: boolean;
  message?: string;
}
```

| Field             | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `shouldSkip`      | Skip this tool call entirely. Only meaningful for `PreToolUse`. |
| `shouldInterrupt` | Stop the agent immediately.                                     |
| `suppressOutput`  | Suppress the tool's output from the conversation.               |
| `message`         | Feedback string sent to the agent.                              |

Returning an empty object `{}` lets the tool proceed normally.

### `hookCallbacks` option shape

```typescript
Partial<Record<HookEvent, HookCallback | HookCallback[]>>;
```

A map from hook event names to a single callback or an array of callbacks. When multiple callbacks are registered for one event, they execute in order. The first `shouldInterrupt: true` result short-circuits the remaining callbacks.

## `Query` Class

The object returned by `query()`. Implements `AsyncIterable<SDKMessage>`.

### Methods

#### `close()`

```typescript
close(): void
```

Terminates the subprocess immediately. The async iterator stops yielding messages. Pending tool calls are abandoned.

#### `interrupt()`

```typescript
interrupt(): void
```

Sends an interrupt signal to the subprocess. The agent finishes its current operation and yields a result message. Less abrupt than `close()`.

#### `setPermissionMode(mode: 'default' | 'auto-edit' | 'full-auto')`

```typescript
setPermissionMode(mode: 'default' | 'auto-edit' | 'full-auto'): void
```

Changes the permission mode mid-session. Takes effect on the next tool call.

#### `setModel(model: string)`

```typescript
setModel(model: string): void
```

Switches the model mid-session. Takes effect on the next assistant turn.

#### `endInput()`

```typescript
endInput(): void
```

Signals that no more user input will be sent. The agent completes its current work and the session ends.

#### `getSessionId()`

```typescript
getSessionId(): string
```

Returns the session ID for this query. Pass this value as the `resume` option in a subsequent `query()` call to continue the session.

#### `isClosed()`

```typescript
isClosed(): boolean
```

Returns `true` if the subprocess has exited and no more messages will be yielded.

## Error Types

### `AbortError`

```typescript
class AbortError extends Error {
  name: 'AbortError';
}
```

Thrown by the async iterator when the query is cancelled via `AbortController.abort()`. The `name` property is always `'AbortError'`.

### `isAbortError()`

```typescript
function isAbortError(error: unknown): error is AbortError;
```

Type guard that checks whether an error is an `AbortError`. Use this in catch blocks:

```typescript
try {
  for await (const message of conversation) {
    // ...
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Query was cancelled.');
  } else {
    throw error;
  }
}
```
