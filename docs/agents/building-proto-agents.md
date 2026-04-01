# Building Proto Agents

Patterns for building production agents with the Proto Agent SDK (`@qwen-code/sdk`). This guide assumes you have completed the [quickstart](../getting-started/proto-agent-sdk.md) and can run a basic `query()` call.

## Control permissions

```typescript
import { query } from '@qwen-code/sdk';

const conversation = query({
  prompt: 'Refactor the auth module to use JWT',
  options: {
    permissionMode: 'default',
    allowedTools: ['Read', 'Glob', 'Grep'],
    excludeTools: ['ShellTool(rm )'],
    canUseTool: async (toolName, toolInput, { signal, suggestions }) => {
      const safeTools = ['Read', 'Glob', 'Grep'];
      if (safeTools.includes(toolName)) {
        return { behavior: 'allow', updatedInput: toolInput };
      }
      return { behavior: 'deny', message: `Tool ${toolName} not approved` };
    },
  },
});

for await (const message of conversation) {
  if (message.type === 'result') {
    console.log('Done:', message.subtype);
  }
}
```

Permission modes control tool approval:

- `'default'` -- read-only tools auto-approve; write tools require `canUseTool` callback or `allowedTools`.
- `'plan'` -- blocks all write tools. The agent presents a plan instead.
- `'auto-edit'` -- auto-approves edit/write file tools; other write tools still need approval.
- `'yolo'` -- all tools execute without confirmation.

Priority chain (highest first): `excludeTools` > `permissionMode` > `allowedTools` > `canUseTool` > default deny.

## Register hook callbacks

```typescript
import { query, type HookCallback } from '@qwen-code/sdk';

const auditLogger: HookCallback = async (input, toolUseId) => {
  console.log(`[audit] tool_use_id=${toolUseId}`, input);
  return {};
};

const securityGate: HookCallback = async (input, toolUseId) => {
  const data = input as { tool_name?: string };
  if (data.tool_name === 'Bash') {
    return { shouldInterrupt: true, message: 'Bash not allowed in this session' };
  }
  return {};
};

const conversation = query({
  prompt: 'Implement the payment webhook handler',
  options: {
    hookCallbacks: {
      PreToolUse: [auditLogger, securityGate],
      PostToolUse: async (input) => {
        console.log('[post]', input);
        return {};
      },
    },
  },
});

for await (const message of conversation) {
  // process messages
}
```

The `hookCallbacks` option accepts a record keyed by `HookEvent` name. Values are a single `HookCallback` or an array of them. When `hookCallbacks` is provided, the hook system is auto-enabled.

`HookCallbackResult` controls execution flow:

- `{}` -- continue normally.
- `{ shouldSkip: true }` -- skip this tool call entirely.
- `{ shouldInterrupt: true }` -- stop the agent immediately.
- `{ suppressOutput: true }` -- suppress the tool's output from the conversation.
- `{ message: '...' }` -- send feedback to the agent.

Hook events: `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `SubagentStop`.

## Use custom tools

```typescript
import { query, createSdkMcpServer, tool } from '@qwen-code/sdk';

const server = createSdkMcpServer('project-tools', '1.0.0', [
  tool({
    name: 'get_feature_status',
    description: 'Look up the current status of a feature by ID',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature ID' },
      },
      required: ['featureId'],
    },
    handler: async (input) => {
      const feature = await db.features.findById(input.featureId);
      return feature
        ? { id: feature.id, title: feature.title, status: feature.status }
        : { error: `Feature ${input.featureId} not found` };
    },
  }),
]);

const conversation = query({
  prompt: 'Check the status of feature auth-login-flow',
  options: {
    mcpServers: {
      'project-tools': { type: 'sdk', name: 'project-tools', instance: server },
    },
  },
});
```

`createSdkMcpServer()` creates an in-process MCP server. Tools registered on it are available to the agent alongside built-in tools. The server runs in your Node.js process -- no separate subprocess or network hop.

## Stream partial responses

```typescript
import { query, isSDKPartialAssistantMessage, isSDKAssistantMessage } from '@qwen-code/sdk';

const conversation = query({
  prompt: 'Write a test suite for the user service',
  options: { includePartialMessages: true },
});

for await (const message of conversation) {
  if (isSDKPartialAssistantMessage(message)) {
    const event = message.event;
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);
    }
  }

  if (isSDKAssistantMessage(message)) {
    console.log('\n--- Turn complete ---');
  }
}
```

Set `includePartialMessages: true` to receive `stream_event` messages as the agent generates tokens. Partial messages contain `StreamEvent` payloads with `content_block_start`, `content_block_delta`, and `content_block_stop` events.

## Resume sessions

```typescript
import { query } from '@qwen-code/sdk';

// First query -- capture the session ID
const first = query({
  prompt: 'Analyze the authentication module for security issues',
  options: { sessionId: 'audit-session-001' },
});

for await (const msg of first) {
  // consume all messages
}

const sessionId = first.getSessionId();

// Later -- resume with the same session ID
const second = query({
  prompt: 'Now fix the top three issues you identified',
  options: { resume: sessionId },
});

for await (const msg of second) {
  // the agent retains full context from the first session
}
```

Pass a `sessionId` to name your session explicitly. To continue later, pass that ID to `resume`. The agent retains full context from the prior session.

## Configure subagents

```typescript
import { query, type SubagentConfig } from '@qwen-code/sdk';

const codeReviewer: SubagentConfig = {
  name: 'code-reviewer',
  description: 'Reviews code for bugs, security issues, and performance problems',
  systemPrompt: `You are a code reviewer. Review diffs for:
- Logic errors and edge cases
- Security vulnerabilities (injection, auth bypass, data leaks)
- Performance regressions (N+1 queries, unbounded loops)
Output a structured review with severity levels: critical, warning, info.`,
  level: 'session',
  tools: ['Read', 'Glob', 'Grep', 'Bash'],
  modelConfig: { model: 'claude-sonnet-4-6' },
};

const conversation = query({
  prompt: 'Review the changes in the current branch against dev',
  options: { agents: [codeReviewer] },
});
```

Subagents are independent agent instances the primary agent can delegate to. Each subagent has its own system prompt, model, and tool restrictions. The primary agent decides when to invoke a subagent based on the task.

## Abort a running query

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const controller = new AbortController();

setTimeout(
  () => {
    console.log('Timeout: aborting query');
    controller.abort();
  },
  5 * 60 * 1000
);

const conversation = query({
  prompt: 'Refactor the data layer to use the repository pattern',
  options: { abortController: controller },
});

try {
  for await (const message of conversation) {
    console.log(message.type);
  }
} catch (err) {
  if (isAbortError(err)) {
    console.log('Query was aborted');
  } else {
    throw err;
  }
}
```

Pass an `AbortController` to `query()`. Calling `controller.abort()` sends SIGTERM to the CLI subprocess, then SIGKILL after 5 seconds if it hasn't exited. The async iterator throws an `AbortError`.

## Enable extensions and web search

```typescript
const conversation = query({
  prompt: 'Research WebSocket authentication best practices and implement them',
  options: {
    extensions: ['analysis'],
    webSearch: {
      tavilyApiKey: process.env.TAVILY_API_KEY,
      defaultProvider: 'tavily',
    },
  },
});
```

Pass extension names to `extensions` to enable CLI-level extensions. Configure `webSearch` with API keys and a default provider to allow web search during execution. Both are off by default.
