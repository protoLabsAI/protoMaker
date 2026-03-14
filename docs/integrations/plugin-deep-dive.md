# Plugin Deep Dive

Technical architecture of the protoLabs Claude Code plugin. Covers the MCP server, tool registration, hook lifecycle, command system, and extension points.

For setup instructions, see [Claude Plugin Setup](./claude-plugin.md). For commands and examples, see [Plugin Commands](./plugin-commands.md).

## Plugin Anatomy

```
packages/mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point (stdio transport)
│   └── tools/                # Tool definition modules (22 files)
│       ├── feature-tools.ts
│       ├── agent-tools.ts
│       ├── git-tools.ts
│       └── ...
└── plugins/automaker/
    ├── .claude-plugin/
    │   └── plugin.json       # Plugin manifest (name, version, mcpServers, hooks)
    ├── hooks/
    │   ├── hooks.json        # Hook configuration (mirrors plugin.json)
    │   ├── start-mcp.sh      # MCP server launcher
    │   ├── check-mcp-health.sh
    │   ├── session-context.sh
    │   ├── compaction-prime-directive.sh
    │   ├── pre-compact-save-state.sh
    │   ├── session-end-save.sh
    │   ├── block-dangerous.sh
    │   ├── auto-start-agent.sh
    │   ├── auto-update-plugin.sh
    │   ├── handle-mcp-failure.sh
    │   └── scripts/
    │       ├── post-edit-typecheck.js
    │       └── evaluate-session.js
    ├── commands/              # Slash command definitions (18 files)
    │   ├── board.md
    │   ├── ava.md
    │   ├── setuplab.md
    │   └── ...
    ├── agents/                # Subagent definitions (13 files)
    │   ├── feature-planner.md
    │   ├── codebase-analyzer.md
    │   └── ...
    ├── data/                  # Runtime state (created by hooks)
    │   ├── ava-session-state.json
    │   └── session-history.jsonl
    ├── .env.example
    └── .env                   # User secrets (gitignored)
```

### How the Pieces Connect

1. `claude plugin install protolabs` reads `plugin.json` and copies the plugin to `~/.claude/plugins/protolabs/`
2. On session start, Claude Code launches the MCP server via `start-mcp.sh`
3. `start-mcp.sh` validates `AUTOMAKER_ROOT`, checks for the built binary, then runs `node dist/index.js`
4. The MCP server connects over stdio and registers all tools with Claude Code
5. Hooks fire at lifecycle events (session start, tool use, compaction, session end)
6. Commands and agents are loaded from their respective directories as slash commands and subagent types

## MCP Server Architecture

### Entry Point

`packages/mcp-server/src/index.ts` is a single-file MCP server using `@modelcontextprotocol/sdk`. It runs on stdio -- no HTTP, no WebSocket.

```typescript
const server = new Server(
  { name: 'automaker-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  /* dispatch */
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### The apiCall Proxy

The MCP server is a **thin proxy**. It holds zero business logic. Every tool call becomes an HTTP request to the protoLabs server at `localhost:3008`.

```typescript
async function apiCall(
  endpoint: string,
  body: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<unknown>;
```

Key behaviors:

- URL: `${API_URL}/api${endpoint}` (default: `http://localhost:3008`)
- Authentication: `X-API-Key` header
- GET requests serialize body as query params; POST as JSON body
- **Retry with exponential backoff**: up to 3 retries, base 1s delay, max 10s, 25% jitter
- Retries on network errors and 5xx responses
- Does NOT retry on 4xx client errors

### Context Window Optimization

Several tools optimize for long agent sessions:

- `get_feature` strips `executionHistory`, `descriptionHistory`, `statusHistory`, and `planSpec` by default (pass `includeHistory: true` to include)
- `get_agent_output` truncates to the last 200 lines by default (`maxLines` parameter)
- `ENABLE_TOOL_SEARCH=auto:10` defers tool loading, reducing context by 40-50% in large sessions

### Client-Side Computation

Some tools compute results in the MCP process without a server endpoint:

- `get_dependency_graph` -- fetches `list_features` and builds the graph client-side
- `get_execution_order` -- topological sort over the dependency graph
- `query_board` -- client-side filtering over `list_features` (status, epicId, complexity, search)
- `get_feature_handoff` -- reads directly from the filesystem via `fs/promises`

## Tool Categories

All tools are defined as static schemas in separate module files under `packages/mcp-server/src/tools/`, then aggregated in `index.ts`.

| Module             | File                     | Description                                    |
| ------------------ | ------------------------ | ---------------------------------------------- |
| Feature Management | `feature-tools.ts`       | Feature CRUD, git settings                     |
| Agent Control      | `agent-tools.ts`         | Start/stop agents, templates, dynamic executor |
| Queue              | `queue-tools.ts`         | Feature queue (add, list, clear)               |
| Orchestration      | `orchestration-tools.ts` | Auto-mode, dependencies, execution order       |
| Context & Skills   | `context-tools.ts`       | Context files, skills CRUD                     |
| Git & GitHub       | `git-tools.ts`           | PRs, reviews, worktree management              |
| Git Operations     | `git-ops-tools.ts`       | Staging, file details                          |
| Worktree Git       | `worktree-git-tools.ts`  | Cherry-pick, stash, abort/continue             |
| File Operations    | `file-ops-tools.ts`      | Copy, move, browse files                       |
| Project Lifecycle  | `project-tools.ts`       | Projects, PRD, milestones, phases              |
| Promotion          | `promotion-tools.ts`     | Staging/main promotion pipeline                |
| Calendar           | `calendar-tools.ts`      | Calendar events CRUD                           |
| Content            | `content-tools.ts`       | Content pipeline (blog, docs)                  |
| Integrations       | `integration-tools.ts`   | Discord, HITL forms                            |
| Lead Engineer      | `lead-engineer-tools.ts` | Lead engineer state machine control            |
| Observability      | `observability-tools.ts` | Langfuse traces, costs, scoring, datasets      |
| Quarantine         | `quarantine-tools.ts`    | Quarantine entries, trust tiers                |
| Scheduler          | `scheduler-tools.ts`     | Scheduler status, maintenance tasks            |
| Setup              | `setup-tools.ts`         | SetupLab: research, gap analysis, alignment    |
| Utilities          | `utility-tools.ts`       | Health, board summary, briefing, metrics       |
| Workspace          | `workspace-tools.ts`     | Worktrees, notes, escalation                   |

Each module exports a `Tool[]` array:

```typescript
export const featureTools: Tool[] = [
  {
    name: 'list_features',
    description: '...',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath'],
    },
  },
];
```

### Tool Dispatch

`index.ts` contains a single `handleTool()` function with a `switch` statement over tool names. Each `case` maps to an `apiCall()`. Example:

```typescript
case 'list_features':
  result = await apiCall('/features/list', { projectPath: args.projectPath });
  break;
```

## Hook System

Hooks are shell scripts (or Node.js scripts) that fire at Claude Code lifecycle events. They receive input as JSON on stdin and write output to stdout (injected into Claude's context). Stderr is only visible in verbose mode.

### Exit Codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| 0    | Allow (continue normally)                          |
| 1    | Error (surfaces output as context, does not block) |
| 2    | Block (prevents the tool call entirely)            |

### Hook Configuration

Hooks are defined in both `plugin.json` and `hooks.json`. The plugin manifest is authoritative; `hooks.json` is a development-readable copy kept in sync.

### Lifecycle Events

| Event                | Matchers         | Hooks                                                 | Purpose                                |
| -------------------- | ---------------- | ----------------------------------------------------- | -------------------------------------- |
| `SessionStart`       | `compact`        | `compaction-prime-directive.sh`, `session-context.sh` | Restore identity after compaction      |
| `SessionStart`       | `startup`        | `check-mcp-health.sh`, `session-context.sh`           | Pre-flight diagnostics                 |
| `SessionStart`       | `resume`         | `check-mcp-health.sh`, `session-context.sh`           | Resume checks                          |
| `PreToolUse`         | `Bash`           | `block-dangerous.sh`                                  | Block destructive commands             |
| `PostToolUse`        | `Edit\|Write`    | `auto-update-plugin.sh`, `post-edit-typecheck.js`     | Plugin update reminders, type checking |
| `PostToolUse`        | `create_feature` | `auto-start-agent.sh`                                 | Auto-launch agent on feature creation  |
| `PreCompact`         | (always)         | `pre-compact-save-state.sh`                           | Snapshot state before compaction       |
| `SessionEnd`         | (always)         | `session-end-save.sh`, `evaluate-session.js`          | Persist session summary                |
| `PostToolUseFailure` | MCP tools        | `handle-mcp-failure.sh`                               | Diagnostic output on failure           |

### Hook Details

#### start-mcp.sh

MCP server launcher. Validates `AUTOMAKER_ROOT` is set and `dist/index.js` exists, then runs `node dist/index.js`. This is the `command` referenced in `mcpServers.studio`.

#### check-mcp-health.sh

Pre-flight diagnostics injected on session start. Checks three things in order:

1. `AUTOMAKER_ROOT` is set
2. `packages/mcp-server/dist/index.js` exists (built artifact)
3. `${API_BASE}/api/health` returns HTTP 200 (5s timeout)

Silent if all checks pass -- no context noise on healthy sessions.

#### session-context.sh

Injects board state into Claude's context. Reads feature JSON files directly from `.automaker/features/*/feature.json`, counts by status, shows the current git branch, and flags active work. Also restores pre-compaction context from `data/ava-session-state.json`.

#### compaction-prime-directive.sh

Identity restoration after context window compaction. Outputs mandatory instructions to invoke `/ava`, reads the saved session state, and injects hardcoded operational rules (no server restart, no worktree `cd`, max 2-3 concurrent agents).

Only fires on the `compact` matcher -- not on normal startup or resume.

#### pre-compact-save-state.sh

Snapshots operational state before context compression. Reads all feature JSONs, counts by status, captures in-progress and review titles, runs `gh pr list`, and writes `data/ava-session-state.json`:

```json
{
  "timestamp": "2026-02-28T12:00:00Z",
  "event": "PreCompact",
  "projectPath": "/path/to/project",
  "branch": "dev",
  "board": { "total": 15, "backlog": 3, "in_progress": 2, "review": 1, "done": 8, "blocked": 1 },
  "currentWork": ["Feature A", "Feature B"],
  "inReview": ["Feature C"],
  "prPipeline": { "count": 2, "prs": ["#123", "#124"] }
}
```

#### session-end-save.sh

Overwrites `data/ava-session-state.json` with a `SessionEnd` snapshot and appends one JSONL line to `data/session-history.jsonl` (capped at 100 entries).

#### block-dangerous.sh

Safety guard that blocks catastrophic operations. Exit code 2 prevents the tool call. Blocked patterns include:

- `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf ..`
- `git push --force origin main` (feature branches allowed)
- `git reset --hard`, `git checkout .`, `git restore .`, `git clean -f`
- SQL destructive: `DROP TABLE`, `DROP DATABASE`, `TRUNCATE TABLE`
- Disk destructive: `mkfs`, `dd if=`

#### auto-start-agent.sh

Fires after `create_feature`. Guards: tool succeeded, feature has an ID, not an epic, not human-assigned, no dependencies. On pass, POSTs to `/api/auto-mode/run-feature` to launch an agent automatically.

#### auto-update-plugin.sh

Fires on Edit/Write. If the edited file is inside `packages/mcp-server/plugins/automaker`, outputs a reminder to reinstall the plugin. Extra warning if the file is in `hooks/` (requires full uninstall/reinstall).

#### handle-mcp-failure.sh

Fires on MCP tool failures. Checks server reachability, API key validity, and outputs targeted recovery steps.

#### post-edit-typecheck.js

Node.js hook. After editing a `.ts`/`.tsx` file, walks up to the nearest `tsconfig.json` and runs `npx tsc --noEmit`. Filters output to errors in the edited file only (max 10 lines). Exit 1 surfaces errors; exit 0 if errors are only in other files.

#### evaluate-session.js

Fires on session end. Counts user messages and tool uses from the conversation transcript. If the session had 10+ user messages, suggests extracting patterns to `.automaker/memory/`.

## Command System

Commands are markdown files with YAML frontmatter in `packages/mcp-server/plugins/automaker/commands/`.

### Format

```yaml
---
name: command-name
description: One-line description
argument-hint: (optional args syntax)
allowed-tools:
  - ToolName
  - mcp__plugin_protolabs_studio__tool_name
model: sonnet # optional model override
temporary: true # optional flag for short-lived commands
temporary-reason: '...'
---
# Command body (prompt instructions for Claude)
```

### Key Fields

| Field           | Required | Description                                     |
| --------------- | -------- | ----------------------------------------------- |
| `name`          | Yes      | Slash command name (e.g., `board` for `/board`) |
| `description`   | Yes      | One-line description shown in help              |
| `argument-hint` | No       | Argument syntax hint                            |
| `allowed-tools` | Yes      | Whitelist of tools this command can use         |
| `model`         | No       | Model override (haiku, sonnet, opus)            |
| `temporary`     | No       | Marks command for future removal                |

### Commands vs Subagents

| Aspect     | Command                        | Subagent                                      |
| ---------- | ------------------------------ | --------------------------------------------- |
| Location   | `commands/`                    | `agents/`                                     |
| Invocation | `/command-name`                | `Task(subagent_type: "protolabs:agent-name")` |
| Execution  | In-context (same conversation) | Spawned as a subprocess                       |
| Context    | Full conversation history      | Only the prompt provided                      |
| Use case   | Interactive workflows          | Parallelizable, isolated tasks                |

### Current Commands (17)

`/auto-mode`, `/ava`, `/board`, `/calendar-assistant`, `/context`, `/deep-research`, `/due-diligence`, `/headsdown`, `/improve-prompts`, `/orchestrate`, `/plan-project`, `/promote`, `/setuplab`, `/ship`, `/sparc-prd`, `/update-plugin`, `/welcome`

## Session Lifecycle

### Startup Flow

```
Claude Code starts
  → plugin.json read by Claude Code
  → start-mcp.sh launched (stdio transport)
    → validates AUTOMAKER_ROOT
    → checks dist/index.js exists
    → runs: node dist/index.js
  → SessionStart hooks fire:
    → check-mcp-health.sh (diagnostics)
    → session-context.sh (board state injection)
  → Tools registered with Claude Code
  → Session ready
```

### Compaction Flow

```
Context window approaching limit
  → PreCompact hook fires:
    → pre-compact-save-state.sh (snapshots board, PRs to ava-session-state.json)
  → Claude Code compresses conversation
  → SessionStart (compact matcher) hooks fire:
    → compaction-prime-directive.sh (identity restoration, operational rules)
    → session-context.sh (current board state)
  → Session continues with restored context
```

### Session End Flow

```
User exits or session closes
  → SessionEnd hooks fire:
    → session-end-save.sh (final snapshot to ava-session-state.json, append to session-history.jsonl)
    → evaluate-session.js (pattern extraction suggestion if 10+ user messages)
```

## Extension Points

### Adding a New Tool

1. Create or extend a module in `packages/mcp-server/src/tools/`:

```typescript
export const myTools: Tool[] = [
  {
    name: 'my_tool',
    description: 'What it does',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath'],
    },
  },
];
```

2. Import and spread into the `tools` array in `index.ts`:

```typescript
import { myTools } from './tools/my-tools.js';
const tools: Tool[] = [...featureTools, ...myTools /* ... */];
```

3. Add a `case` in `handleTool()`:

```typescript
case 'my_tool':
  result = await apiCall('/my-endpoint', { projectPath: args.projectPath });
  break;
```

4. Rebuild: `npm run build:packages`

### Adding a New Command

Create a markdown file in `packages/mcp-server/plugins/automaker/commands/`:

```yaml
---
name: my-command
description: What this command does
allowed-tools:
  - mcp__plugin_protolabs_studio__list_features
---
# Instructions for Claude when this command is invoked
```

Reinstall the plugin: `claude plugin uninstall protolabs && claude plugin install protolabs`

### Adding a New Hook

1. Create the script in `packages/mcp-server/plugins/automaker/hooks/`
2. Make it executable: `chmod +x hooks/my-hook.sh`
3. Register in both `plugin.json` and `hooks.json`:

```json
{
  "event": "PostToolUse",
  "matcher": "ToolPattern",
  "hooks": [
    {
      "type": "command",
      "command": "bash ${AUTOMAKER_ROOT}/packages/mcp-server/plugins/automaker/hooks/my-hook.sh"
    }
  ]
}
```

4. Reinstall the plugin (hooks require full uninstall/reinstall)

### Adding a New Subagent

Create a markdown file in `packages/mcp-server/plugins/automaker/agents/`:

```yaml
---
name: my-agent
description: What this agent does
allowed-tools:
  - Read
  - Write
  - mcp__plugin_protolabs_studio__tool_name
model: sonnet
---
# Agent prompt instructions
```

Invoke via: `Task(subagent_type: "protolabs:my-agent", prompt: "...")`

## Related Documentation

- [Plugin Quickstart](./plugin-quickstart.md) -- 5-minute setup guide
- [Claude Plugin Setup](./claude-plugin.md) -- Installation, configuration, Docker deployment
- [Plugin Commands](./plugin-commands.md) -- Commands reference, subagents, examples
- [MCP Tools Reference](./mcp-tools-reference.md) -- Full MCP tool catalog
