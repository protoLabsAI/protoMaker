# ACP Agent Support — Design

Design for connecting external CLI coding agents (Claude Code, Gemini CLI, Codex CLI, OpenCode) to the Ava chat interface over **ACP — the [Agent Client Protocol](https://agentclientprotocol.com)**. This is a planning document; nothing here is built yet. Tracking issue: protoMaker#3865.

## Why this is non-trivial

protoMaker has **two separate agent-execution paths**, and the chat interface does not use the one where a "provider" naturally lives. Understanding this split is the whole design.

|                     | Path 1 — Ava chat                                                                       | Path 2 — provider abstraction                                 |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Entry               | `POST /api/chat` (`routes/chat/index.ts`)                                               | `simpleQuery` / auto-mode feature execution                   |
| Engine              | AI SDK v6 `streamText(...)`                                                             | `BaseProvider.executeQuery → AsyncGenerator<ProviderMessage>` |
| Model               | gateway `LanguageModelV3` (`lib/ai-provider.ts`)                                        | provider chosen by `ProviderFactory.getProviderForModel`      |
| Loop owner          | **the server** drives the tool loop (`stopWhen: stepCountIs(30)`, `tools: activeTools`) | **the provider/agent** drives its own loop                    |
| Tools               | `ava-tools.ts`, executed server-side                                                    | provider-native (CLI agents bring their own)                  |
| Output              | `UIMessageStream` SSE chunks                                                            | `ProviderMessage` async generator                             |
| HITL                | `needsApproval` + `POST /api/chat/tool-approval`                                        | n/a (autonomous)                                              |
| Existing CLI agents | —                                                                                       | Cursor / Codex / OpenCode (`CliProvider` subclasses)          |

An ACP agent is a **full agent**: it owns its loop, owns its tools, and speaks JSON-RPC over stdio. That makes it a natural `CliProvider` on **Path 2** — it is essentially the standardized version of what the Cursor/Codex providers already do bespoke (spawn subprocess, stream events, `normalizeEvent()` → `ProviderMessage`).

But the **chat interface lives on Path 1** (`streamText`). `streamText` expects a `LanguageModelV3` — a single-completion model it drives a tool loop _around_. An ACP agent is not that; it refuses to surrender loop control. So "connect CLI agents via the chat interface" reduces to: **bridge a Path-2 ACP agent into the Path-1 stream.** That bridge is the work.

## What ACP is

JSON-RPC 2.0 over stdio. The **client spawns the agent** as a subprocess and initiates everything.

```
client (protoMaker)                         agent (claude-code-acp, gemini --experimental-acp, ...)
  │                                           │
  ├── initialize ───────────────────────────►│   capability negotiation
  ├── (authenticate) ───────────────────────►│   optional; agent uses its own credentials
  ├── session/new | session/load ───────────►│   establish conversation
  ├── session/prompt ───────────────────────►│   send user turn
  │◄── session/update (notifications) ────────┤   agent_message_chunk, agent_thought_chunk,
  │                                           │   tool_call, tool_call_update, plan, ...
  │◄── fs/read_text_file ──────────────────────┤  agent calls BACK into client
  │◄── fs/write_text_file ─────────────────────┤
  │◄── session/request_permission ─────────────┤  user authorization for an action
  │◄── terminal/create | output | wait | kill ─┤
  │◄── session/prompt response (stop reason) ──┤
  ├── session/cancel (notification) ─────────►│   interrupt
```

Implementers (as of 2026-05): Claude Code (`claude-code-acp` adapter), Gemini CLI (native, `--experimental-acp`), Codex CLI, OpenCode, JetBrains Junie. JetBrains co-leads the protocol with Zed.

**Canonical source:** the protocol is defined by [zed-industries](https://github.com/zed-industries/zed) — the `agent_client_protocol` Rust crate (also on crates.io / a TS package `@zed-industries/agent-client-protocol`) is the reference implementation, and Zed itself is the reference _client_. Build the protocol layer against that crate's schema, not hand-rolled types. The shapes below are from the ACP schema.

## Protocol reference (grounded in the ACP schema)

### initialize — capability negotiation

`initialize { protocolVersion: uint16, clientCapabilities, clientInfo? } → { protocolVersion, agentCapabilities, authMethods }`

What protoMaker (the **client**) declares:

```jsonc
clientCapabilities: {
  fs: { readTextFile: true, writeTextFile: true }, // we service the agent's file IO
  terminal: <per-agent config, default false>      // gate terminal until proven needed
}
```

The agent reports `agentCapabilities` — `loadSession` (resume support), `promptCapabilities` (image/audio/embeddedContext), `mcpCapabilities` (http/sse), `sessionCapabilities` (close/list/resume), and `authMethods`. The `AcpProvider` records these to gate features (e.g. only offer resume if `loadSession`).

### session/new — and the MCP bridge (how the agent gets protoMaker's tools)

`session/new { cwd, mcpServers: McpServer[] } → { sessionId, modes?, configOptions? }`

**`mcpServers` is the answer to the original audit's open question** ("how do ACP agents get board capabilities?"). ACP lets the client hand the agent a list of MCP servers (`stdio | http | sse`) at session start. We pass protoMaker's own MCP server (`packages/mcp-server`, the `create_feature` / `get_board_summary` / etc. tools) here — so the external agent gains board/orchestration tools without us re-implementing anything. Start with `fs` + `permission` only; add the board MCP server as milestone 4.

### session/prompt → session/update → stop reason

`session/prompt { sessionId, prompt: ContentBlock[] } → { stopReason }`, with the agent streaming `session/update` notifications until it returns a `stopReason` (`end_turn | max_tokens | stop_sequence | tool_use | cancelled`). `session/cancel` (notification) maps to our `AbortController`.

### ACP `session/update` → `ProviderMessage` (the adapter contract)

This is the precise mapping the chat-route adapter implements:

| ACP `SessionUpdate` variant                         | Fields                                                                   | → `ProviderMessage` / `UIMessageStream`                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `agent_message_chunk` (`ContentChunk`)              | `content: ContentBlock` (text/image/…)                                   | `{type:'assistant', content:[{type:'text'}]}` → `text`                                                             |
| `agent_thought_chunk`                               | `thinking: string`                                                       | `{type:'thinking'}` → `reasoning`                                                                                  |
| `tool_call` / `tool_call_update` (`ToolCallUpdate`) | `toolUseId`, `toolName`, `toolInput`, `status`, `content[]`              | `status initiated/executing` → `tool_use`; `completed/error` → `tool_result`; `blocked` → permission-denied marker |
| ↳ `ToolCallContent`                                 | `text` / `diff{path,oldText,newText}` / `terminal{terminalId}` / `image` | text→tool_result text; **diff→`CheckpointService` capture** + diff render                                          |
| `plan` (`Plan`)                                     | `entries[]{status,priority,content}`                                     | `data-plan` custom part                                                                                            |
| `available_commands_update`                         | `availableCommands[]`                                                    | slash-command surface (optional)                                                                                   |
| `current_mode_update` / `config_option_update`      | mode / config ids                                                        | session UI state (optional)                                                                                        |

`ToolCallStatus = initiated | executing | completed | error | blocked`. `ToolCallKind = standalone | grouped`.

### session/request_permission → the existing HITL gate

`session/request_permission { sessionId, toolCall, options: PermissionOption[] } → { outcome }`

`PermissionOption.kind ∈ {allow_once, allow_always, reject_once, reject_always}`. Map directly to the chat HITL flow (`needsApproval` + `POST /api/chat/tool-approval`): present the options, and return `{ outcome: 'selected', optionId }` on approve or `{ outcome: 'cancelled' }` on dismiss. `allow_always`/`reject_always` persist a per-session/agent decision so we don't re-prompt.

### Client-side methods protoMaker must service

The agent calls _back_ into us; the `AcpProvider` implements these (respecting `ALLOWED_ROOT_DIRECTORY`):

- `fs/read_text_file { path, line?, limit? } → { content }`
- `fs/write_text_file { path, content }` — **intercept to call `CheckpointService.captureFileState` before writing** (preserves chat rewind for ACP agents).
- `terminal/create | output | wait_for_exit | kill | release` — gate behind the per-agent `terminal` capability; deny/no-op until milestone 4.

## Decisions

- **Auth: ACP agents are a gateway exception.** Connected CLI agents authenticate themselves (their own API keys / OAuth) and their model traffic does **not** flow through `api.proto-labs.ai`. This is a deliberate, scoped exception to the "always through the gateway" rule — it is the cost of supporting arbitrary external agents. Document it at the agent-config surface so operators know ACP-agent usage is not gateway-metered or gateway-keyed.
- **Approach: build a first-class `AcpProvider` (Path 2) plus a chat-route adapter (into Path 1).** Not the AI-SDK community provider as the production path (see Alternatives).

## Architecture

### 1. `AcpProvider` (Path 2)

A new provider in `apps/server/src/providers/acp-provider.ts`. ACP's spawn-and-stream shape matches `CliProvider`, but the transport is JSON-RPC request/response + server-initiated callbacks rather than one-way JSONL — so it likely extends `BaseProvider` directly and embeds a small ACP client, rather than reusing `spawnJSONLProcess`.

Responsibilities:

- Spawn the agent subprocess (`command` + `args` from agent config), wire stdio to a JSON-RPC peer.
- Drive the session: `initialize` → `session/new`/`session/load` → `session/prompt`.
- Map inbound `session/update` notifications → `ProviderMessage`:
  - `agent_message_chunk` → `{ type: 'assistant', content: [{ type: 'text' }] }`
  - `agent_thought_chunk` → `{ type: 'thinking' }`
  - `tool_call` → `{ type: 'tool_use' }`
  - `tool_call_update` → `tool_result`-shaped update
  - `plan` → carried through as structured content
  - stop reason → `{ type: 'result' }`
- Service agent → client callbacks:
  - `fs/read_text_file` / `fs/write_text_file` against `cwd` (respect `ALLOWED_ROOT_DIRECTORY`).
  - `session/request_permission` → bubble up as an approval request (see adapter).
  - `terminal/*` → spawned-process management (gate behind a capability flag initially; can be a no-op/denied until needed).
- Lifecycle: `session/cancel` on `AbortController` abort; reap the subprocess on completion/error (reuse existing orphan-reaping discipline).

Register in `provider-factory.ts` with `canHandleModel: (m) => m.startsWith('acp/')`, priority between `openai-compatible` and `groq`. Model id encodes the agent, e.g. `acp/claude-code`, `acp/gemini`. The agent roster comes from settings (see Config).

**Bonus:** once `AcpProvider` exists on Path 2, ACP agents are immediately usable by `simpleQuery` and auto-mode **feature execution**, not just chat — same as Cursor/Codex today.

### 2. Chat-route adapter (Path 2 → Path 1)

In `routes/chat/index.ts`, branch on the resolved model:

- **Non-ACP model** → existing `streamText` path, unchanged.
- **`acp/*` model** → skip `streamText`; call `acpProvider.executeQuery({ prompt, model, cwd: projectPath, abortController, sdkSessionId })` and pump the `ProviderMessage` stream into the **same `UIMessageStream` writer** the chat route already uses:

  | `ProviderMessage` | `UIMessageStream` chunk                |
  | ----------------- | -------------------------------------- |
  | `text`            | `text`                                 |
  | `thinking`        | `reasoning`                            |
  | `tool_use`        | `tool-call`                            |
  | `tool_result`     | `tool-result`                          |
  | `plan`            | `data-plan` (existing custom part)     |
  | tool progress     | `data-subagent` (existing custom part) |

  Because the UI consumes `UIMessageStream` chunks, **the UI transport (`DefaultChatTransport`) and rendering need no changes** — the chat just receives the same chunk vocabulary from a different source.

- **Permissions:** ACP `session/request_permission` maps onto the existing HITL seam — emit the same approval event the `needsApproval` tool flow uses, and resolve it via `POST /api/chat/tool-approval`. The agent's request blocks until the user responds.
- **Checkpoints:** intercept `fs/write_text_file` to call `CheckpointService.captureFileState(...)` before the write, preserving the existing rewind capability for ACP agents.

### 3. Tool / capability surface

ava-tools (board, features, agent control) **do not auto-apply** to an ACP agent — the agent only knows the capabilities the client advertises in `initialize` plus any MCP servers it is given. Two levers to expose protoMaker capabilities:

- **Filesystem + terminal** via the ACP client callbacks (built in to `AcpProvider`).
- **Board / orchestration tools** via an **MCP bridge** — point the agent at the existing protoMaker MCP server (`packages/mcp-server`) through ACP's MCP-server passthrough, so `create_feature`, `get_board_summary`, etc. become available to the external agent.

Start minimal: filesystem + permission only. Add the MCP board bridge as a second milestone once the basic loop is proven.

### 4. Config

Agents are declared in settings (global or per-project `ava-config.json`), keyed by the `acp/<id>` model:

```jsonc
{
  "acpAgents": {
    "claude-code": {
      "command": "claude-code-acp",
      "args": [],
      "env": {}, // agent's own credentials live here — NOT gateway-routed
      "capabilities": { "fs": true, "terminal": false, "boardMcp": false },
    },
    "gemini": {
      "command": "gemini",
      "args": ["--experimental-acp"],
    },
  },
}
```

The chat model picker lists configured ACP agents alongside gateway models.

## Milestones

1. **Spike (throwaway).** Wire `@mcpc-tech/acp-ai-provider` into the existing `streamText` call and connect one agent (Gemini CLI or `claude-code-acp`) end-to-end. Purpose: learn the protocol + agent quirks fast. Not merged.
2. **`AcpProvider` core.** ACP client + provider, `session/new`/`prompt`, `session/update` → `ProviderMessage`, fs callbacks, cancel/reap. Registered in `ProviderFactory`. Unit-tested against a mock ACP peer. Usable via `simpleQuery`.
3. **Chat adapter.** `acp/*` branch in the chat route, `ProviderMessage` → `UIMessageStream`, permission → tool-approval, fs/write → checkpoint. One agent selectable in the chat UI.
4. **Capability bridge.** MCP board-tools passthrough + terminal callbacks, gated by per-agent `capabilities`.
5. **Polish.** Session resume (`session/load` ↔ chat `sessionId`), multiple agents, model-variant selection, observability.

## Risks & open questions

- **Auth bypasses the gateway** (decided exception). Means ACP-agent usage is unmetered/unkeyed by protoLabs and depends on the operator configuring the agent's own credentials. Make this explicit in UI + docs.
- **Tool parity.** Without the MCP board bridge, an ACP agent in chat is far less capable than Ava (no board awareness). Manage expectations until milestone 4.
- **Process lifecycle.** Spawned agents must be cancelled and reaped reliably; lean on the existing orphan-reaping discipline.
- **Protocol drift.** ACP is young and evolving (v1, actively maintained). Pin and capability-negotiate defensively in `initialize`.
- **`claude-code-acp` and the gateway rule.** The Claude Code ACP adapter will use Anthropic auth directly — confirm this is acceptable per the decided exception before shipping that specific agent.

## Alternatives considered

- **`@mcpc-tech/acp-ai-provider` as the production path.** Exposes a `LanguageModel` usable directly in `streamText` — minimal change. Rejected for production because: tools only via MCP (ava-tools wouldn't be the SDK `tools`), permission requests are not surfaced into our HITL, it spawns a process per `languageModel()` call, model-variant selection is unsupported, and it is a young third-party dependency. Retained as the **spike** vehicle (milestone 1).
- **ACP as a full `@protolabsai/acp-client` package + dedicated agent surface.** Cleanest long-term if ACP becomes core, but overkill before the basic loop is proven. Revisit after milestone 3.

## Key code references

- Chat loop: `apps/server/src/routes/chat/index.ts` (`streamText` ~:633, tool-approval ~:855, rewind ~:911)
- Chat tools: `apps/server/src/routes/chat/ava-tools.ts`
- Gateway model: `apps/server/src/lib/ai-provider.ts`
- Provider abstraction: `apps/server/src/providers/{base-provider,cli-provider,cursor-provider,provider-factory,simple-query-service}.ts`
- UI transport: `apps/ui/src/hooks/use-chat-session.ts`
- See also: [Provider Architecture](./providers.md), [Ava Chat](./ava-chat.md), [Ava Chat System](../dev/ava-chat-system.md)
