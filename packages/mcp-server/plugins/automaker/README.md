# Automaker Claude Plugin

Claude Code plugin for managing Automaker's Kanban board, AI agents, and feature orchestration.

## Installation

1. Build the MCP server (if not already built):

   ```bash
   cd packages/mcp-server
   npm run build
   ```

2. Symlink the plugin to Claude's plugins directory:

   ```bash
   # Replace <path-to-automaker> with your local repo path
   ln -s <path-to-automaker>/packages/mcp-server/plugins/automaker ~/.claude/plugins/automaker

   # Or from the automaker repo root:
   ln -s "$PWD/packages/mcp-server/plugins/automaker" ~/.claude/plugins/automaker
   ```

3. Restart Claude Code

## Requirements

- Automaker server must be running (`npm run dev` from automaker root)
- Default API URL: `http://localhost:3008`

## Commands

### /board

View and manage the Kanban board.

```
/board                    # Show board overview
/board create             # Create a new feature
/board [feature-id]       # Show feature details
/board agent-output       # Review what an agent did
```

### /auto-mode

Control autonomous feature processing.

```
/auto-mode start          # Start auto-mode
/auto-mode stop           # Stop auto-mode
/auto-mode status         # Check if running
```

### /orchestrate

Manage feature dependencies and execution order.

```
/orchestrate              # View dependency graph
/orchestrate [feature]    # Set dependencies for a feature
/orchestrate order        # Show execution order
```

### /context

Manage context files for AI agents.

```
/context                  # List context files
/context add              # Add a new context file
/context [filename]       # View a context file
/context spec             # View/edit project spec
```

## MCP Tools Available

### Feature Management

- `list_features` - List all features by status
- `get_feature` - Get feature details
- `create_feature` - Create a new feature
- `update_feature` - Update feature properties
- `delete_feature` - Delete a feature
- `move_feature` - Move to different column

### Agent Control

- `start_agent` - Start an agent on a feature
- `stop_agent` - Stop a running agent
- `list_running_agents` - List active agents
- `get_agent_output` - Get agent execution log
- `send_message_to_agent` - Send message to running agent

### Queue Management

- `queue_feature` - Add feature to queue
- `list_queue` - List queued features
- `clear_queue` - Clear the queue

### Context Files

- `list_context_files` - List context files
- `get_context_file` - Read a context file
- `create_context_file` - Create a context file
- `delete_context_file` - Delete a context file

### Project Spec

- `get_project_spec` - Get spec.md content
- `update_project_spec` - Update spec.md

### Orchestration

- `set_feature_dependencies` - Set feature dependencies
- `get_dependency_graph` - Get full dependency graph
- `start_auto_mode` - Start auto-mode
- `stop_auto_mode` - Stop auto-mode
- `get_auto_mode_status` - Check auto-mode status
- `get_execution_order` - Get resolved execution order

### Utilities

- `health_check` - Check server status
- `get_board_summary` - Get feature counts by status

## Subagents

The plugin includes specialized agents for complex tasks:

### automaker:feature-planner

Breaks down complex features into smaller, implementable tasks with proper dependencies.

```
Task(subagent_type: "automaker:feature-planner",
     prompt: "Project: /path/to/project. Feature: Add user authentication system.")
```

### automaker:agent-reviewer

Reviews completed agent work and provides feedback.

```
Task(subagent_type: "automaker:agent-reviewer",
     prompt: "Project: /path/to/project. Feature ID: abc-123. Focus: security, tests")
```

### automaker:codebase-analyzer

Analyzes codebase structure, patterns, and suggests optimal execution order.

```
Task(subagent_type: "automaker:codebase-analyzer",
     prompt: "Project: /path/to/project. Map architecture and suggest feature dependencies.")
```

## Configuration

The plugin connects to Automaker via the MCP server. Configure the API URL in `plugin.json`:

```json
{
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008"
      }
    }
  }
}
```

## Development

To modify the plugin:

1. Edit files in `packages/mcp-server/plugins/automaker/`
2. Restart Claude Code to pick up changes

Commands are markdown files in `commands/`. Follow the frontmatter format:

```yaml
---
name: command-name
description: What the command does
allowed-tools:
  - mcp__automaker__tool_name
---
# Command Instructions

Your prompt content here...
```
