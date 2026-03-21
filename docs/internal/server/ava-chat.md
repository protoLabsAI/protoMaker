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
    scheduling: boolean; // list_timers, pause_timer, resume_timer
    memory: boolean; // remember, recall, forget
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
| `apps/server/src/routes/chat/ava-tools.ts`                 | `buildAvaTools(projectPath, services, config)` — 21 tool groups        |
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

## Self-Scheduling

The `scheduling` tool group lets Ava create and manage recurring tasks that run a stored prompt on a schedule. Tasks persist across server restarts in `.automaker/ava-tasks.json`.

### Tools

| Tool                   | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `schedule_task`        | Register a recurring task with a cron expression or fixed interval in milliseconds         |
| `cancel_task`          | Remove a scheduled task by ID (only `ava:`-prefixed tasks can be cancelled)                |
| `list_scheduled_tasks` | List all `ava:`-prefixed tasks with schedule, last run time, next run time, failure counts |
| `trigger_task`         | Execute a task immediately without waiting for its next scheduled time                     |

### Task ID convention

Task IDs are automatically prefixed with `ava:` and derived from the human-readable name:

```
name: "Daily Board Summary"
→ taskId: "ava:daily-board-summary"
```

This namespace separates agent-created tasks from system tasks registered by server modules. Only `ava:` tasks are exposed via the scheduling tools; system tasks are not accessible through chat.

### Persistence

Each call to `schedule_task` writes a `AvaScheduledTaskDef` entry to `.automaker/ava-tasks.json`:

```typescript
interface AvaScheduledTaskDef {
  id: string; // e.g. "ava:daily-board-summary"
  name: string; // Human-readable name
  prompt: string; // Prompt sent to Ava at run time
  description?: string;
  schedule: { type: 'cron'; expression: string } | { type: 'interval'; intervalMs: number };
  createdAt: string; // ISO 8601
}
```

On server startup, stored tasks are re-registered with `SchedulerService` via `ensureAvaTasksRegistered()`. Task handlers invoke `simpleQuery({ prompt, cwd: projectPath, maxTurns: 1 })`.

### Configuration

Enabled by default (`scheduling: true` in `DEFAULT_AVA_CONFIG.toolGroups`). Requires `schedulerService` to be present in `AvaToolsServices`. Disable via `ava-config.json`:

```json
{
  "toolGroups": {
    "scheduling": false
  }
}
```

### Implementation

- **Persistence file**: `{projectPath}/.automaker/ava-tasks.json`
- **Tool registration**: `apps/server/src/routes/chat/ava-tools.ts` — scheduling block at end of `buildAvaTools()`
- **Scheduler integration**: `apps/server/src/services/scheduler-service.ts` — `registerTask()` for cron, `registerInterval()` for fixed intervals

## Persistent Memory

The `memory` tool group provides persistent key-value storage that survives across chat sessions. Memory is stored at `{projectPath}/.automaker/ava-memory.json` using atomic writes for crash safety.

### Tools

| Tool       | Description                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| `remember` | Store or update a memory entry with a key, content, and optional tags        |
| `recall`   | Search memory by exact key, tag match, or substring (ranked, recency-sorted) |
| `forget`   | Remove a memory entry by exact key                                           |

### Schema

```typescript
interface MemoryStore {
  version: 1;
  entries: Record<string, MemoryEntry>;
}

interface MemoryEntry {
  key: string;
  content: string;
  tags: string[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  accessCount: number; // incremented on each recall match
}
```

### Recall Ranking

When `recall(query)` is called, results are returned in three tiers:

1. **Exact key match** — query exactly equals the entry key
2. **Tag match** — query matches one of the entry's tags (case-insensitive)
3. **Substring match** — query found in key or content (case-insensitive)

Within each tier, results are sorted by `updatedAt` descending (most recent first).

### Configuration

Enabled by default (`memory: true` in `DEFAULT_AVA_CONFIG.toolGroups`). Disable via `ava-config.json`:

```json
{
  "toolGroups": {
    "memory": false
  }
}
```

### Implementation

- **Service**: `apps/server/src/services/ava-memory-service.ts` — `AvaMemoryService`
- **Wiring**: Instantiated per-request in `apps/server/src/routes/chat/index.ts` when `projectPath` is available
- **Atomic writes**: Uses `atomicWriteJson` from `@protolabsai/utils` (temp file + rename + fsync)

## Gateway Service

`AvaGatewayService` runs outside the chat request cycle. It provides periodic board health monitoring, critical event routing, and integration with `HealthMonitorService` for auto-remediation. It is not a tool group — it operates as a background service initialized at server startup.

### Initialization

```typescript
// apps/server/src/server/services.ts
const avaGatewayService = getAvaGatewayService(
  featureLoader,
  settingsService,
  healthMonitorService
);
await avaGatewayService.initialize(events, projectPath, infraChannelId);
avaGatewayService.start();
```

`initialize()` registers the project with `HealthMonitorService` for auto-remediation checks. `start()` subscribes to the event bus and begins routing critical events to Discord.

### Auto-remediation

`HealthMonitorService` runs every 5 minutes and checks all registered project paths for issues. Issues marked `autoRemediable: true` are fixed automatically (for example, clearing stuck worktree locks). Issues that require human intervention are flagged as alerts.

The `AvaGatewayService` constructor passes `healthMonitor` at injection time:

```typescript
new AvaGatewayService(featureLoader, settingsService, healthMonitorService);
```

### Circuit breaker

The gateway wraps heartbeat evaluations with a `CircuitBreaker` (5 failures, 5-minute cooldown). When the circuit is open, evaluations are skipped until the cooldown expires. This prevents Discord spam during sustained outages.

### Status API

```
GET /api/ava/status
```

Returns `GatewayStatus`:

```typescript
interface GatewayStatus {
  initialized: boolean;
  listening: boolean;
  projectPath: string | null;
  infraChannelId: string | null;
  lastHeartbeat: string | null;
  lastHeartbeatStatus: 'ok' | 'alert' | null;
  totalHeartbeats: number;
  totalAlerts: number;
  circuitBreaker: {
    isOpen: boolean;
    failureCount: number;
  };
}
```

### Key files

| File                                                 | Role                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `apps/server/src/services/ava-gateway-service.ts`    | Heartbeat loop, event subscription, circuit breaker           |
| `apps/server/src/services/health-monitor-service.ts` | Resource checks, auto-remediation for `autoRemediable` issues |
| `apps/server/src/routes/ava/routes/status.ts`        | `GET /api/ava/status` endpoint                                |

## See Also

- [Ava Chat System — Architecture Pipeline](../dev/ava-chat-system.md#architecture-pipeline) — full end-to-end request flow diagram
- [SDK Integration](../agents/sdk-integration.md) — Claude Agent SDK query options and session management
