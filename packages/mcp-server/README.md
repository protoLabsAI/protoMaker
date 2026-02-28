# Automaker MCP Server

MCP (Model Context Protocol) server for interacting with Automaker's Kanban board and AI agents.

This allows Claude Code, Cline, and other MCP-compatible tools to manage Automaker features programmatically.

## Installation

```bash
cd packages/mcp-server
npm install
npm run build
```

## Configuration

### Claude Code

Install via the plugin system (recommended):

```bash
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
claude plugin install protolabs
```

Or add manually to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "automaker": {
      "command": "bash",
      "args": ["/path/to/automaker/packages/mcp-server/plugins/automaker/hooks/start-mcp.sh"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "your-api-key",
        "GH_TOKEN": "${GH_TOKEN}",
        "ENABLE_TOOL_SEARCH": "auto:10"
      }
    }
  }
}
```

### Environment Variables

| Variable             | Description                | Default                 |
| -------------------- | -------------------------- | ----------------------- |
| `AUTOMAKER_API_URL`  | Automaker API base URL     | `http://localhost:3008` |
| `AUTOMAKER_API_KEY`  | API key for authentication | (required)              |
| `GH_TOKEN`           | GitHub token for PR ops    | (optional)              |
| `ENABLE_TOOL_SEARCH` | Tool search mode           | `auto:10`               |

## Available Tools (~159)

### Feature Management (7)

| Tool                          | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `list_features`               | List all features, optionally filtered by status |
| `get_feature`                 | Get detailed info about a specific feature       |
| `create_feature`              | Create a new feature on the board                |
| `update_feature`              | Update feature properties                        |
| `delete_feature`              | Delete a feature                                 |
| `move_feature`                | Move feature to a different column               |
| `update_feature_git_settings` | Update git branch/worktree settings              |

### Agent Control (5)

| Tool                    | Description                          |
| ----------------------- | ------------------------------------ |
| `start_agent`           | Start an AI agent on a feature       |
| `stop_agent`            | Stop a running agent                 |
| `list_running_agents`   | List all currently running agents    |
| `get_agent_output`      | Get the log/output from an agent run |
| `send_message_to_agent` | Send a message to a running agent    |

### Queue Management (3)

| Tool            | Description                           |
| --------------- | ------------------------------------- |
| `queue_feature` | Add a feature to the processing queue |
| `list_queue`    | List queued features                  |
| `clear_queue`   | Clear the queue                       |

### Context & Skills (8)

| Tool                  | Description                       |
| --------------------- | --------------------------------- |
| `list_context_files`  | List files in .automaker/context/ |
| `get_context_file`    | Read a context file               |
| `create_context_file` | Create a new context file         |
| `delete_context_file` | Delete a context file             |
| `list_skills`         | List skills in .automaker/skills/ |
| `get_skill`           | Read a skill file                 |
| `create_skill`        | Create a new skill file           |
| `delete_skill`        | Delete a skill file               |

### Orchestration (6)

| Tool                       | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `set_feature_dependencies` | Set dependencies for a feature                     |
| `get_dependency_graph`     | Get the full dependency graph                      |
| `start_auto_mode`          | Start auto-mode with configurable concurrency      |
| `stop_auto_mode`           | Stop auto-mode                                     |
| `get_auto_mode_status`     | Check if auto-mode is running                      |
| `get_execution_order`      | Get resolved execution order based on dependencies |

### Project Orchestration (7)

| Tool                      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `list_projects`           | List all project plans                                            |
| `get_project`             | Get project details including milestones, phases, and PRD         |
| `create_project`          | Create a new project with SPARC PRD and milestone/phase structure |
| `update_project`          | Update project title, goal, or status                             |
| `delete_project`          | Delete a project plan and all its files                           |
| `archive_project`         | Archive a completed project                                       |
| `create_project_features` | Convert project phases to board features with epic support        |

### Additional Categories

The server exposes many more tools across these categories:

- **Project Lifecycle** (7) -- initiate, PRD generation, approval, launch
- **GitHub & Git** (9) -- PRs, reviews, enhanced status, staging
- **Worktrees** (10) -- worktree management, cherry-pick, stash ops
- **HITL / Forms** (5) -- user input, form management
- **Calendar** (4) -- event CRUD
- **Content Pipeline** (6) -- content flows, review, export
- **Notes** (8) -- note tabs CRUD and permissions
- **Promotion** (5) -- staging/main promotion pipeline
- **Observability** (8) -- Langfuse traces, costs, prompts, datasets
- **Agent Templates** (7) -- template CRUD and execution
- **And more** -- Quarantine, Reports, SetupLab, Discord, Metrics, etc.

See [MCP Tools Reference](../../docs/integrations/mcp-tools-reference.md) for the complete catalog.

## Feature Properties

### Complexity and Model Selection

Features can specify a `complexity` level that determines which AI model is used:

| Complexity      | Model  | Use Case                                        |
| --------------- | ------ | ----------------------------------------------- |
| `small`         | Haiku  | Quick fixes, trivial changes                    |
| `medium`        | Sonnet | Standard features (default)                     |
| `large`         | Sonnet | Complex multi-file features                     |
| `architectural` | Opus   | Core infrastructure, key architecture decisions |

**Auto-escalation:** Features that fail 2+ times automatically escalate to Opus on retry.

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## License

MIT
