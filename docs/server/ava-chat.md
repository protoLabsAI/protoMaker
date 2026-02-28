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
  ├── loadContextFiles(projectPath)    → projectContext string (if contextInjection: true)
  ├── getSitrep(projectPath)           → sitrep markdown (if sitrepInjection: true, cached 5min)
  ├── buildAvaSystemPrompt(opts)       → enriched system prompt
  ├── buildAvaTools(projectPath, ...)  → tool set gated by toolGroups flags
  └── streamText({ tools, maxSteps: 10 })

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
    boardRead: boolean; // get_board_summary, list_features, get_feature
    boardWrite: boolean; // create_feature, update_feature, move_feature, delete_feature
    agentControl: boolean; // list_running_agents, start_agent, stop_agent, get_agent_output
    autoMode: boolean; // get_auto_mode_status, start_auto_mode, stop_auto_mode
    projectMgmt: boolean; // get_project_spec, update_project_spec
    orchestration: boolean; // get_execution_order, set_feature_dependencies
  };
  sitrepInjection: boolean;
  contextInjection: boolean;
  systemPromptExtension: string;
}
```

All tool groups default to `true`. Model defaults to `sonnet`.

## Key Files

| File                                                       | Role                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/server/src/routes/chat/index.ts`                     | Main chat route — wires config, sitrep, tools, streamText              |
| `apps/server/src/routes/chat/ava-config.ts`                | `loadAvaConfig` / `saveAvaConfig` with deep-merge defaults             |
| `apps/server/src/routes/chat/ava-tools.ts`                 | `buildAvaTools(projectPath, services, config)` — all 6 tool groups     |
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

## Session Scoping

Sessions are stored in Zustand (`chat-store.ts`) keyed by `projectId`. Switching projects shows only that project's history. Sessions created before v2 (project scoping) are assigned `projectId: 'default'` via the store migration.

## Settings UI

The gear icon in the chat header opens `AvaSettingsPanel`, which loads config via `GET /api/ava/config/get` and saves via `POST /api/ava/config/update`. Changes take effect on the next chat request — no server restart required.
