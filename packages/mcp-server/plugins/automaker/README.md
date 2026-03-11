# protoLabs Studio Claude Plugin

Claude Code plugin for managing protoLabs Studio's Kanban board, AI agents, and feature orchestration.

## Installation

### Option 1: Marketplace Install (Recommended)

```bash
# Add the plugin marketplace
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins

# Install the plugin
claude plugin install protolabs

# Configure environment
PLUGIN_DIR=~/.claude/plugins/protolabs
cp "$PLUGIN_DIR/.env.example" "$PLUGIN_DIR/.env"
echo "AUTOMAKER_ROOT=$(pwd)" >> "$PLUGIN_DIR/.env"
echo "AUTOMAKER_API_KEY=your-dev-key-2026" >> "$PLUGIN_DIR/.env"
```

### Option 2: Symlink

```bash
ln -s /path/to/automaker/packages/mcp-server/plugins/automaker ~/.claude/plugins/protolabs
```

Restart Claude Code after installation.

## Requirements

- Automaker server running (`npm run dev` from automaker root)
- MCP server built (`npm run build:packages`)
- `AUTOMAKER_ROOT` set in plugin `.env` to your repo's absolute path

## Commands (13)

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `/board`              | View and manage your Kanban board                |
| `/auto-mode`          | Start/stop autonomous feature processing         |
| `/orchestrate`        | Manage feature dependencies                      |
| `/context`            | Manage AI agent context files                    |
| `/plan-project`       | Full project lifecycle -- research to launch     |
| `/ship`               | Stage, commit, push, create PR, auto-merge       |
| `/headsdown`          | Deep work mode -- process features autonomously  |
| `/calendar-assistant` | Calendar and scheduling operations               |
| `/due-diligence`      | Validate approaches with evidence-based research |
| `/deep-research`      | Research codebase before planning                |
| `/sparc-prd`          | Create a SPARC-style PRD                         |
| `/improve-prompts`    | Analyze and improve LLM prompts                  |

## MCP Tools (~159)

The MCP server exposes ~159 tools organized by category:

- **Feature Management** (7) -- CRUD, move, git settings
- **Agent Control** (5) -- start, stop, list, output, messaging
- **Queue Management** (3) -- queue, list, clear
- **Context & Skills** (8) -- context files, skills CRUD
- **Project Spec** (2) -- get/update spec.md
- **Orchestration** (6) -- dependencies, auto-mode, execution order
- **Project Orchestration** (7) -- projects, milestones, phases, epics
- **Project Lifecycle** (7) -- initiate, PRD, approval, launch
- **GitHub Operations** (7) -- PRs, reviews, comments, enhanced status
- **Git Operations** (2) -- staging, file details
- **Worktrees** (3) -- list, status, create PR
- **Worktree Git Ops** (7) -- cherry-pick, abort, continue, stash
- **HITL / Forms** (5) -- user input, forms, responses
- **Actionable Items** (2) -- list and act
- **Calendar** (4) -- events CRUD
- **Quarantine & Trust** (5) -- quarantine entries, trust tiers
- **File Operations** (3) -- copy, move, browse
- **Content Pipeline** (6) -- content flows, review, export
- **Notes** (8) -- tabs CRUD, permissions
- **Promotion** (5) -- staging/main promotion pipeline
- **Scheduler** (2) -- status, maintenance tasks
- **Observability** (8) -- Langfuse traces, costs, prompts, datasets
- **Lead Engineer** (4) -- start, stop, status, handoffs
- **Agent Templates** (7) -- template CRUD, execution
- **Escalation** (3) -- status, logs, acknowledgment
- **Reports** (2) -- generate, open
- **SetupLab** (7) -- repo analysis, gap analysis, alignment
- **Discord** (4) -- DMs, provisioning, ceremonies
- **Integration** (3) -- Twitch, Discord
- **Settings & Health** (4) -- settings, health, logs
- **Events** (2) -- events, notifications
- **Metrics** (3) -- project metrics, capacity, forecasts
- **Utilities** (5) -- health, board summary, briefing, query

See [MCP Tools Reference](../../../docs/integrations/mcp-tools-reference.md) for the full catalog.

## Subagents (11)

| Agent                 | Model  | Purpose                             |
| --------------------- | ------ | ----------------------------------- |
| `feature-planner`     | Opus   | Break down features into tasks      |
| `codebase-analyzer`   | Opus   | Analyze codebase patterns           |
| `deep-research`       | Opus   | Explore codebase before planning    |
| `sparc-prd`           | Opus   | Create SPARC PRDs                   |
| `prd-reviewer`        | Opus   | Validate PRD quality                |
| `agent-reviewer`      | Sonnet | Review completed agent work         |
| `feature-factory`     | Haiku  | Create features from project phases |
| `project-scaffold`    | Haiku  | Scaffold project directories        |
| `devops-health-check` | Haiku  | Run health diagnostics              |
| `devops-logs`         | Haiku  | Analyze container logs              |
| `devops-backup`       | Haiku  | Backup/restore Docker volumes       |

## Configuration

The plugin connects to Automaker via `start-mcp.sh`. Configure in the plugin `.env`:

| Variable             | Description                            | Required |
| -------------------- | -------------------------------------- | -------- |
| `AUTOMAKER_ROOT`     | Absolute path to your repo clone       | Yes      |
| `AUTOMAKER_API_KEY`  | API key matching the server            | Yes      |
| `AUTOMAKER_API_URL`  | API base URL (default: localhost:3008) | No       |
| `GH_TOKEN`           | GitHub token for PR operations         | No       |
| `DISCORD_BOT_TOKEN`  | Discord bot token                      | No       |
| `CONTEXT7_API_KEY`   | Context7 API key                       | No       |
| `ENABLE_TOOL_SEARCH` | Tool search mode (default: auto:10)    | No       |

## Development

Commands are markdown files in `commands/`. Agents are in `agents/`.

```yaml
---
name: command-name
description: What the command does
argument-hint: (optional arguments)
allowed-tools:
  - mcp__protolabs__tool_name
---
# Command Instructions

Your prompt content here...
```

After modifying hooks, do a full reinstall: `claude plugin uninstall protolabs && claude plugin install protolabs`.
