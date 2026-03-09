# Ava Chat System

Project-scoped AI chat with live board context, tool execution, and per-project configuration.

## Overview

The Ava chat system extends the base chat endpoint with:

- **Project context injection** — CLAUDE.md and `.automaker/context/` files injected into the system prompt
- **Live sitrep** — board counts, running agents, and auto-mode status injected at request time
- **Tool execution** — Ava can read and write the board, control agents, and manage auto-mode
- **Per-project config** — model, tool groups, injection toggles, and system prompt extensions stored in `.automaker/ava-config.json`
- **Project-scoped sessions** — chat history filtered by `projectId`

## Architecture

```
POST /api/chat
  ├── loadAvaConfig(projectPath)       → AvaConfig (from .automaker/ava-config.json)
  ├── loadAvaContext(projectPath)      → CLAUDE.md + ava-prompt.md (if contextInjection: true)
  ├── getSitrep(projectPath)           → sitrep markdown (if sitrepInjection: true, cached 5min)
  ├── buildAvaSystemPrompt(opts)       → enriched system prompt
  ├── buildAvaTools(projectPath, ...)  → tool set gated by toolGroups flags (19 groups)
  ├── compactMessageHistory(messages)  → message-level compaction when > budget tokens
  ├── streamText({ tools, maxSteps: 10, extendedThinking })
  └── post-stream:
        ├── extractAndResolveCitations(text) → data-citations chunk
        ├── extractPlan(text)                → data-plan chunk
        └── usage stats                      → data-usage chunk

POST /api/chat/tool-approval
  └── Resolves pending subagent tool-approval (gated trust mode only)

GET/POST /api/ava/config/get
POST     /api/ava/config/update
  └── loadAvaConfig / saveAvaConfig   → .automaker/ava-config.json
```

## AvaConfig

Stored at `{projectPath}/.automaker/ava-config.json`. Defaults are used when the file does not exist — no file is written on first load.

```typescript
interface AvaConfig {
  model: 'haiku' | 'sonnet' | 'opus';
  toolGroups: {
    boardRead: boolean; // get_board_summary, list_features, get_feature, create_plan
    boardWrite: boolean; // create_feature, update_feature, move_feature, delete_feature
    agentControl: boolean; // list_running_agents, start_agent, stop_agent, get_agent_output
    autoMode: boolean; // get_auto_mode_status, start_auto_mode, stop_auto_mode
    projectMgmt: boolean; // get_project_spec, update_project_spec, update_project
    orchestration: boolean; // get_execution_order, set_feature_dependencies
    agentDelegation: boolean; // execute_dynamic_agent, list_agent_templates
    notes: boolean; // list_note_tabs, read_note_tab, write_note_tab
    metrics: boolean; // get_project_metrics, get_capacity_metrics
    prWorkflow: boolean; // check_pr_status, get_pr_feedback, merge_pr
    promotion: boolean; // list_staging_candidates, promote_to_staging
    contextFiles: boolean; // list_context_files, get_context_file, create_context_file
    projects: boolean; // list_projects, get_project, create_project
    briefing: boolean; // get_briefing, get_board_summary_extended
    avaChannel: boolean; // Ava coordination channel tools
    discord: boolean; // Discord messaging tools
    calendar: boolean; // Calendar event tools
    health: boolean; // Health monitoring tools
    settings: boolean; // Global settings access tools
  };
  sitrepInjection: boolean;
  contextInjection: boolean;
  systemPromptExtension: string;
  autoApproveTools: boolean; // When true, destructive tools skip HITL confirmation
  mcpServers?: MCPServerConfig[];
  subagentTrust: 'full' | 'gated';
}
```

All tool groups default to `true`. Model defaults to `sonnet`. `autoApproveTools` defaults to `false`. `subagentTrust` defaults to `'full'`.

## Key Files

| File                                                       | Role                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/server/src/routes/chat/index.ts`                     | Main chat route — wires config, sitrep, tools, streamText              |
| `apps/server/src/routes/chat/ava-config.ts`                | `loadAvaConfig` / `saveAvaConfig` with deep-merge defaults             |
| `apps/server/src/routes/chat/ava-tools.ts`                 | `buildAvaTools(projectPath, services, config)` — 19 tool groups        |
| `apps/server/src/routes/chat/sitrep.ts`                    | `getSitrep(projectPath)` — 5-min TTL cache, `invalidateSitrep()`       |
| `apps/server/src/routes/chat/personas.ts`                  | `buildAvaSystemPrompt({ ctx, projectContext, sitrep, extension })`     |
| `apps/server/src/routes/ava/index.ts`                      | `/api/ava/config/get` and `/api/ava/config/update` HTTP endpoints      |
| `apps/ui/src/components/views/chat/ava-settings-panel.tsx` | Settings UI — model, tool toggles, injection toggles, prompt extension |
| `apps/ui/src/hooks/use-chat-session.ts`                    | Sends `projectPath` in request body, scopes sessions by `projectId`    |
| `apps/ui/src/store/chat-store.ts`                          | `ChatSession.projectId`, `getSessionsForProject()`, v1→v2 migration    |

## Tool Execution

Tools are defined in `ava-tools.ts` using the AI SDK `tool()` helper. They call `FeatureLoader`, `AutoModeService`, and `AgentService` directly (no HTTP roundtrip). `maxSteps: 10` allows Ava to chain multiple tool calls per response.

Tool availability is gated per-request by `AvaConfig.toolGroups`. Disabling `boardWrite` prevents feature creation/deletion even if Ava attempts it.

## Sitrep

`getSitrep(projectPath)` generates a markdown document containing:

- Feature counts by status (backlog / in_progress / review / done / blocked)
- Titles of features currently in_progress or review
- Running agent feature IDs and start times
- Auto-mode enabled/disabled status

Results are cached for 5 minutes per project path. Call `invalidateSitrep(projectPath)` to force a refresh on the next request (called automatically after board-write tool calls).

## Citation Extraction

After streaming completes, the server scans the full assistant response text for `[[feature:id]]` and `[[doc:path]]` markers. Each unique citation is resolved and sent to the client as a `data-citations` chunk on the UI message stream. Feature citations are resolved via `FeatureLoader.get()`; doc citations use the path as the title.

The client renders these as inline badges and a Sources section at the bottom of the response.

## Plan Extraction

When the assistant response contains a fenced ` ```plan ``` ` block containing valid JSON with a `steps` array, the server parses it and sends a `data-plan` chunk to the client. The client renders this as a visual plan card with titled steps and status indicators.

## Message Compaction

Before sending messages to the model, the server estimates the token count. When it exceeds `COMPACTION_BUDGET_TOKENS`, `compactMessageHistory()` summarizes older tool results to one line and truncates long assistant responses, preserving the most recent messages verbatim.

In addition, Anthropic-side context management is configured per request:

- At 80k input tokens: clears tool uses, keeping 5 most recent (removes tool inputs)
- At 150k input tokens: activates server-side `compact_20260112` compaction

## Session Scoping

Sessions are stored in Zustand (`chat-store.ts`) keyed by `projectId`. Switching projects shows only that project's history. Sessions created before v2 (project scoping) are assigned `projectId: 'default'` via the store migration.

## Settings UI

The gear icon in the chat header opens `AvaSettingsPanel`, which loads config via `GET /api/ava/config/get` and saves via `POST /api/ava/config/update`. Changes take effect on the next chat request — no server restart required.

## SDK Hooks

When Ava delegates to an inner agent via `execute_dynamic_agent`, the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is invoked through `DynamicAgentExecutor`. Three hook types are wired in:

| Hook           | Trigger                                          | Effect                                                      |
| -------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `PostToolUse`  | After every tool execution in inner agent        | Accumulates cost, emits `agent:tool-result` WebSocket event |
| `Notification` | SDK informational events (context compact, etc.) | Surfaces warnings in the agent output log                   |
| `SubagentStop` | Inner agent session ends                         | Marks sub-run complete, aggregates cost to parent           |

Hooks are configured in `DynamicAgentExecutor` before calling `query()`. They are not exposed to the outer Ava loop — Ava only sees the final tool result from `execute_dynamic_agent`.

## Custom MCP Servers

`AvaConfig.mcpServers` lets projects supply additional MCP server definitions that are forwarded to delegated agents:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

These servers are passed to `createChatOptions({ mcpServers })` before the inner agent runs. The outer Ava session does **not** receive MCP tools — they are scoped to delegated agents only. This prevents Ava from directly calling high-privilege tools while still allowing inner agents to use them under the trust gate.

## Trust Model

`AvaConfig.subagentTrust` controls how subagent tool calls are authorized:

| Level   | Effect                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `full`  | Subagents run with `bypassPermissions`; all tool calls execute immediately without approval (default)                                                        |
| `gated` | Each subagent tool call emits a `subagent:tool-approval-request` event; the client must approve via `POST /api/chat/tool-approval` before execution proceeds |

Trust is enforced via the `canUseTool` callback built by `buildCanUseToolCallback()` in `agent-trust.ts`. In `gated` mode, the callback suspends the agent execution and waits for a `subagent:tool-approval-response` event on the shared event bus before resolving.

Omitting `subagentTrust` from `ava-config.json` defaults to `'full'`.

## Tool Progress WebSocket Events

During agent delegation, `DynamicAgentExecutor` emits progress events over the WebSocket connection (keyed by `agentRunId`). The chat UI subscribes to these via `AgentOutputCard`:

| Event type          | Payload                                     | Rendered by                   |
| ------------------- | ------------------------------------------- | ----------------------------- |
| `agent:text`        | `{ text }` — streamed text from inner agent | `AgentOutputCard` text stream |
| `agent:tool-use`    | `{ toolName, input }` — inner tool call     | Tool invocation row           |
| `agent:tool-result` | `{ toolName, result }` — inner tool result  | Collapsible result            |
| `agent:complete`    | `{ cost, stepCount }` — final summary       | Completion chip               |
| `agent:error`       | `{ message }` — agent error                 | Error callout                 |

These events are only emitted for delegated agents — Ava's own tool calls stream through the SSE channel, not WebSocket.

## See Also

- [Ava Chat System — Architecture Pipeline](../dev/ava-chat-system.md#architecture-pipeline) — full end-to-end request flow diagram
- [Ava Delegation Flow](../agents/ava-delegation.md) — how `execute_dynamic_agent` routes to `DynamicAgentExecutor`
- [SDK Integration](../agents/sdk-integration.md) — Claude Agent SDK query options and session management
