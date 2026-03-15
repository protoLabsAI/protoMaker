# Quickstart

This guide gets you from zero to a running AI agent app in under 5 minutes. You'll have a streaming chat interface, working tools, and built-in observability.

## Prerequisites

- Node.js 20 or later
- An Anthropic API key (or OpenAI / Google API key)
- npm 10 or later

## Install and run

### 1. Clone or scaffold the starter

If you scaffolded this project with the CLI, your project is already set up. Otherwise clone the repository:

```bash
git clone <your-project-url>
cd my-agent-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set your API key

Copy the example environment file and add your key:

```bash
cp packages/server/.env.example packages/server/.env
```

Open `packages/server/.env` and set at least one provider key:

```bash
# Anthropic (recommended)
ANTHROPIC_API_KEY=sk-ant-...

# Or OpenAI
OPENAI_API_KEY=sk-...

# Or Google
GOOGLE_API_KEY=AIza...
```

### 4. Start the development servers

```bash
npm run dev
```

This starts two servers in parallel:

- **API server** at http://localhost:3001 (chat, tools, traces)
- **UI** at http://localhost:5173 (the chat interface)

### 5. Open the app

Open [http://localhost:5173](http://localhost:5173) in your browser. Type a message and hit Enter. You're talking to your agent.

## What's running

After `npm run dev`, your project has:

| Component            | URL                   | Purpose                       |
| -------------------- | --------------------- | ----------------------------- |
| Chat UI              | http://localhost:5173 | React frontend                |
| API server           | http://localhost:3001 | Streaming chat, tools, traces |
| WebSocket (optional) | ws://localhost:3002   | Live tool progress updates    |

The API server automatically picks up the first configured provider.

## Try the built-in features

### Send a message

Type anything in the chat box. The server streams tokens back as they arrive.

### Use a tool

Ask: _"What time is it?"_ or _"What's the weather in New York?"_

The agent calls a built-in tool and streams the result inline.

### Run a slash command

Type `/summarize` before any text:

```
/summarize The quick brown fox jumps over the lazy dog
```

Slash commands prepend instructions to the system prompt without changing the conversation.

### Switch models

Click the model selector in the toolbar and choose between `haiku`, `sonnet`, `opus`, `gpt-4o`, or `gemini-2.0-flash`. You can also type full model IDs like `claude-opus-4-5`.

### View traces

Navigate to [http://localhost:5173/traces](http://localhost:5173/traces). Every conversation is captured with token counts, latency, and tool call details.

## Next steps

- **[Creating tools](../guides/creating-tools.md)** — Add your own tools that work across MCP, LangGraph, and Express
- **[Agent architecture](../concepts/agent-architecture.md)** — Understand how the packages fit together
- **[Tracing and debugging](../guides/tracing-debugging.md)** — Capture and inspect agent behavior
- **[Building flows](../guides/building-flows.md)** — Compose multi-step agent workflows with LangGraph
