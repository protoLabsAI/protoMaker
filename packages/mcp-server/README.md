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

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["/path/to/automaker/packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "your-api-key"
      }
    }
  }
}
```

Or with npx (after publishing):

```json
{
  "mcpServers": {
    "automaker": {
      "command": "npx",
      "args": ["@automaker/mcp-server"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Environment Variables

| Variable            | Description                | Default                 |
| ------------------- | -------------------------- | ----------------------- |
| `AUTOMAKER_API_URL` | Automaker API base URL     | `http://localhost:3008` |
| `AUTOMAKER_API_KEY` | API key for authentication | (required)              |

## Available Tools

### Feature Management

| Tool             | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `list_features`  | List all features in a project, optionally filtered by status |
| `get_feature`    | Get detailed info about a specific feature                    |
| `create_feature` | Create a new feature on the board                             |
| `update_feature` | Update feature properties (title, description, status)        |
| `delete_feature` | Delete a feature                                              |
| `move_feature`   | Move feature to a different column                            |

### Agent Control

| Tool                    | Description                          |
| ----------------------- | ------------------------------------ |
| `start_agent`           | Start an AI agent on a feature       |
| `stop_agent`            | Stop a running agent                 |
| `list_running_agents`   | List all currently running agents    |
| `get_agent_output`      | Get the log/output from an agent run |
| `send_message_to_agent` | Send a message to a running agent    |

### Queue Management

| Tool            | Description                           |
| --------------- | ------------------------------------- |
| `queue_feature` | Add a feature to the processing queue |
| `list_queue`    | List queued features                  |
| `clear_queue`   | Clear the queue                       |

### Context Files

| Tool                  | Description                       |
| --------------------- | --------------------------------- |
| `list_context_files`  | List files in .automaker/context/ |
| `get_context_file`    | Read a context file               |
| `create_context_file` | Create a new context file         |
| `delete_context_file` | Delete a context file             |

### Project Spec

| Tool                  | Description                    |
| --------------------- | ------------------------------ |
| `get_project_spec`    | Get .automaker/spec.md content |
| `update_project_spec` | Update the project spec        |

### Orchestration

| Tool                       | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `set_feature_dependencies` | Set dependencies for a feature                     |
| `get_dependency_graph`     | Get the full dependency graph for all features     |
| `start_auto_mode`          | Start auto-mode with configurable concurrency      |
| `stop_auto_mode`           | Stop auto-mode for a project                       |
| `get_auto_mode_status`     | Check if auto-mode is running                      |
| `get_execution_order`      | Get resolved execution order based on dependencies |

### Project Orchestration

| Tool                      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `list_projects`           | List all project plans in a project                               |
| `get_project`             | Get project details including milestones, phases, and PRD         |
| `create_project`          | Create a new project with SPARC PRD and milestone/phase structure |
| `update_project`          | Update project title, goal, or status                             |
| `delete_project`          | Delete a project plan and all its files                           |
| `create_project_features` | Convert project phases to Kanban board features with epic support |

### Utilities

| Tool                | Description                          |
| ------------------- | ------------------------------------ |
| `health_check`      | Check if Automaker server is running |
| `get_board_summary` | Get feature counts by status         |

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

**Example:**

```typescript
// Create an architectural feature (uses Opus)
mcp__automaker__create_feature({
  projectPath: '/path/to/project',
  title: 'Core Type System Refactor',
  description: 'Refactor the type system to support...',
  complexity: 'architectural',
});

// Create a simple fix (uses Haiku)
mcp__automaker__create_feature({
  projectPath: '/path/to/project',
  title: 'Fix typo in README',
  description: 'Fix spelling error...',
  complexity: 'small',
});
```

## Example Usage (via Claude Code)

Once configured, you can ask Claude:

- "List all features in /path/to/my/project"
- "Create a feature to add user authentication"
- "Move feature abc-123 to in-progress"
- "What did the agent do on the login feature?"
- "Create a context file with our coding standards"
- "Show me the board summary"

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
