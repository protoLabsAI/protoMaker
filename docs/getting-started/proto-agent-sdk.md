# Proto Agent SDK Quickstart

This tutorial walks you through your first programmatic interaction with the Proto CLI. You will install the `@qwen-code/sdk` package, send a single-turn query, add a hook callback, and run a multi-turn conversation with streaming input. By the end, you will have a working TypeScript script that spawns Proto as a subprocess and communicates over JSON-Lines.

## Prerequisites

- Node.js 18 or later
- npm

## Install the SDK

```bash
npm install @qwen-code/sdk
```

The package exports a single entry point. You import `query` and supporting types from `@qwen-code/sdk`.

## Send a single-turn query

Create a file called `agent.ts`:

```typescript
import { query } from '@qwen-code/sdk';

const conversation = query({ prompt: 'What files are in the current directory?' });

for await (const message of conversation) {
  if (message.type === 'assistant') {
    console.log(message.message.content);
  }
}
```

`query()` spawns the Proto CLI as a child process and returns an async iterable of messages. Each message has a `type` field that tells you what kind of event it represents. The `assistant` type carries the model's text response in `message.content`.

## Run it

```bash
npx tsx agent.ts
```

You should see the model list the files in your working directory. The process exits automatically when the conversation ends.

## Add a hook callback

Hooks let you intercept tool calls before or after they execute. Add a `PreToolUse` callback that logs every tool invocation:

```typescript
import { query } from '@qwen-code/sdk';

const conversation = query({
  prompt: 'Create a hello.txt file',
  options: {
    permissionMode: 'auto-edit',
    hookCallbacks: {
      PreToolUse: async (input) => {
        console.log('[hook] Tool about to run:', input);
        return {};
      },
    },
  },
});

for await (const message of conversation) {
  if (message.type === 'assistant') {
    console.log(message.message.content);
  }
}
```

`permissionMode: 'auto-edit'` grants the agent permission to create and edit files without prompting. The `PreToolUse` hook fires before each tool execution. Returning an empty object lets the tool proceed normally. You can return `{ shouldSkip: true }` to prevent the tool from running, or `{ shouldInterrupt: true }` to stop the agent entirely.

Run it the same way:

```bash
npx tsx agent.ts
```

You should see hook log lines interleaved with the assistant's output, followed by a `hello.txt` file in your working directory.

## Run a multi-turn conversation

For interactive use cases, you can send additional user messages after the initial prompt. Use the `Query` object's async iterable interface combined with `AbortController` to manage the session lifecycle:

```typescript
import { query } from '@qwen-code/sdk';

async function main() {
  const conversation = query({
    prompt: 'List the files in this directory.',
    options: {
      permissionMode: 'auto-edit',
    },
  });

  for await (const message of conversation) {
    if (message.type === 'assistant') {
      console.log('Agent:', message.message.content);
    }

    if (message.type === 'result') {
      console.log('Turn complete. Turns:', message.num_turns);
      break;
    }
  }

  // Start a second turn in the same session
  const sessionId = conversation.getSessionId();
  const followUp = query({
    prompt: 'Now create a summary.txt with the list you just gave me.',
    options: {
      permissionMode: 'auto-edit',
      resume: sessionId,
    },
  });

  for await (const message of followUp) {
    if (message.type === 'assistant') {
      console.log('Agent:', message.message.content);
    }

    if (message.type === 'result') {
      console.log('Session complete. Turns:', message.num_turns);
    }
  }
}

main();
```

The `resume` option takes a session ID string. It tells the CLI to load the prior session's conversation history so the agent retains full context from the first turn.

## Stream partial responses

If you want to display text as the model generates it, enable partial messages:

```typescript
import { query, isSDKAssistantMessage } from '@qwen-code/sdk';

const conversation = query({
  prompt: 'Explain how async iterators work in TypeScript.',
  options: {
    includePartialMessages: true,
  },
});

for await (const message of conversation) {
  if (message.type === 'stream_event') {
    const event = message.event;
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);
    }
  }

  if (isSDKAssistantMessage(message)) {
    process.stdout.write('\n');
  }
}
```

Partial messages arrive as `stream_event` type events containing `StreamEvent` payloads. Text tokens come through `content_block_delta` events with a `text_delta` type. The final `assistant` message contains the complete response.

## Cancel a running query

Use an `AbortController` to stop the agent mid-execution:

```typescript
import { query } from '@qwen-code/sdk';

const controller = new AbortController();

const conversation = query({
  prompt: 'Refactor all files in src/ to use named exports.',
  options: {
    abortController: controller,
    permissionMode: 'auto-edit',
  },
});

// Cancel after 10 seconds
setTimeout(() => {
  controller.abort();
}, 10_000);

try {
  for await (const message of conversation) {
    if (message.type === 'assistant') {
      console.log(message.message.content);
    }
  }
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    console.log('Query cancelled.');
  }
}
```

Aborting sends a termination signal to the subprocess. The async iterator throws an `AbortError` that you can catch and handle.

## Next steps

- **[Proto Agent SDK Reference](../reference/proto-agent-sdk.md)** -- Complete API reference for all types, options, and methods
