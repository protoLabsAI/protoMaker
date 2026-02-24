# Claude Code Plugin for protoLabs

Setup guide for the Claude Code plugin and MCP server. For commands and examples, see [Plugin Commands](./plugin-commands.md). For the full MCP tool catalog, see [MCP Tools Reference](./mcp-tools-reference.md).

## Quick Start

### Option 1: Install from GitHub (Recommended)

Install directly from the GitHub repository:

```bash
# 1. Add the protoLabs plugin marketplace from GitHub
claude plugin marketplace add https://github.com/proto-labs-ai/automaker/tree/main/packages/mcp-server/plugins

# 2. Install the plugin
claude plugin install automaker

# 3. Start protoLabs server (in a separate terminal)
git clone https://github.com/proto-labs-ai/automaker.git
cd automaker
npm install
npm run dev:web

# 4. Verify it works
claude
> /board
```

### Option 2: Install from Local Clone (Development)

For developers working on protoLabs:

```bash
# 1. Clone and install protoLabs
git clone https://github.com/proto-labs-ai/automaker.git
cd automaker
npm install

# 2. Build the MCP server
npm run build:packages

# 3. Start protoLabs server
npm run dev:web

# 4. In a new terminal, add the plugin marketplace and install
claude plugin marketplace add $(pwd)/packages/mcp-server/plugins
claude plugin install automaker

# 5. Verify it works
claude
> /board
```

That's it! You now have access to 120+ MCP tools and slash commands for managing your Kanban board directly from Claude Code.

### What You Can Do

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `/board`           | View and manage your Kanban board    |
| `/auto-mode start` | Start autonomous feature processing  |
| `/orchestrate`     | Manage feature dependencies          |
| `/context`         | Manage AI agent context files        |
| `/groom`           | Review and organize the board        |
| `/pr-review`       | Review and manage open pull requests |
| `/plan-project`    | Full project orchestration pipeline  |
| `/cleanup`         | Codebase maintenance and hygiene     |

See [Plugin Commands](./plugin-commands.md) for full command reference and examples.

## Overview

The protoLabs Claude Code plugin enables you to:

- **Manage Features**: Create, update, and track features on your Kanban board
- **Control Agents**: Start, stop, and monitor AI agents working on features
- **Orchestrate Workflows**: Set up dependencies and run auto-mode for autonomous processing
- **Configure Context**: Manage context files that guide AI agent behavior

The plugin consists of:

1. **MCP Server** (`@automaker/mcp-server`) - Exposes protoLabs's API via Model Context Protocol
2. **Claude Plugin** (`packages/mcp-server/plugins/automaker`) - Provides slash commands and subagents

## Installation

### Prerequisites

- protoLabs server running (`npm run dev` from the automaker root directory)
- Claude Code CLI installed and authenticated
- Node.js 22+

### Step 1: Start protoLabs with a Fixed API Key

By default, protoLabs generates a random API key on each restart. For Claude Code integration, use a fixed key:

```bash
# Start protoLabs with a fixed API key
AUTOMAKER_API_KEY=your-dev-key-2026 npm run dev
```

Or add it to your `.env` file:

```bash
AUTOMAKER_API_KEY=your-dev-key-2026
```

### Step 2: Build the MCP Server (if not already built)

```bash
cd packages/mcp-server
npm run build
```

### Step 3: Install the Plugin

**Option A: Add via Marketplace (Recommended)**

```bash
# Add the local marketplace
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins

# Install the plugin
claude plugin install automaker
```

**Option B: Symlink Directly**

```bash
# Create symlink to Claude's plugins directory
ln -s /path/to/automaker/packages/mcp-server/plugins/automaker ~/.claude/plugins/automaker
```

### Step 4: Restart Claude Code

After installation, restart Claude Code to load the plugin:

```bash
claude
```

### Step 5: Verify Installation

Test that the plugin is working:

```
/board
```

You should see your Kanban board or a message to start the protoLabs server.

## Configuration

### Environment Variables

Configure these in your shell or the plugin's `plugin.json`:

| Variable            | Description                | Default                 |
| ------------------- | -------------------------- | ----------------------- |
| `AUTOMAKER_API_URL` | protoLabs API base URL     | `http://localhost:3008` |
| `AUTOMAKER_API_KEY` | API key for authentication | (required)              |

### Plugin Configuration

The plugin configuration is in `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json`:

```json
{
  "name": "automaker",
  "description": "protoLabs - AI Development Studio",
  "version": "1.0.0",
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Manual MCP Configuration

If you prefer to configure MCP directly, add to `~/.claude/claude_desktop_config.json`:

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

## Docker Deployment

For production deployments using Docker, follow these steps to configure the MCP plugin to communicate with a containerized protoLabs server.

### Prerequisites

- Docker and Docker Compose installed
- protoLabs repository cloned
- Claude Code CLI installed

### Step 1: Configure docker-compose.override.yml

Create `docker-compose.override.yml` in the automaker root directory:

```yaml
# protoLabs Production Override
# Mounts host project directories for development work

services:
  server:
    environment:
      - ALLOWED_ROOT_DIRECTORY=/home/youruser/dev
      - AUTOMAKER_API_KEY=your-secure-api-key

    volumes:
      # CRITICAL: Container path must match host path exactly
      - /home/youruser/dev:/home/youruser/dev:rw
      - automaker-data:/data
      - automaker-claude-config:/home/automaker/.claude

    deploy:
      resources:
        limits:
          memory: 8G
        reservations:
          memory: 4G
```

**Path Mapping Note:** The MCP plugin runs on the host and passes paths like `/home/youruser/dev/myproject` to the containerized server. The container must have the exact same path available.

### Step 2: Configure .env File

Create or update `.env` in the automaker root directory:

```bash
AUTOMAKER_API_KEY=your-secure-api-key
UID=1000
GID=1000
HOST=0.0.0.0
PORT=3008
CORS_ORIGIN=http://localhost:3007
ALLOWED_ROOT_DIRECTORY=/home/youruser/dev
VITE_HOSTNAME=localhost
```

### Step 3: Update Plugin Configuration

Edit `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json` to use absolute paths:

```json
{
  "name": "automaker",
  "description": "protoLabs - AI Development Studio",
  "version": "1.0.2",
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["/absolute/path/to/automaker/packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "your-secure-api-key",
        "GH_TOKEN": "${GH_TOKEN}"
      }
    }
  }
}
```

**Note:** The `args` path must be absolute, not relative.

### Step 4: Build and Start

```bash
npm run build:packages
docker compose up -d
curl http://localhost:3008/api/health
```

### Step 5: Install/Reinstall Plugin

```bash
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
claude plugin install automaker
```

### Memory Allocation Guidelines

| Use Case                       | Memory Limit | Reservation |
| ------------------------------ | ------------ | ----------- |
| Light (1-2 concurrent agents)  | 4G           | 2G          |
| Medium (3-5 concurrent agents) | 8G           | 4G          |
| Heavy (6+ concurrent agents)   | 16G          | 8G          |

### Working with Multiple Projects

With the path mapping above, you can use protoLabs with any project under your `ALLOWED_ROOT_DIRECTORY`:

```bash
# Project A
cd /home/youruser/dev/project-a
claude
> /board

# Project B (different terminal)
cd /home/youruser/dev/project-b
claude
> /board
```

Each project maintains its own `.automaker/` directory with independent features, settings, and context files.

## Troubleshooting

### Plugin Not Loading

1. Verify the MCP server is built: `cd packages/mcp-server && npm run build`
2. Check the plugin is installed: `ls ~/.claude/plugins/`
3. Verify the symlink or marketplace entry is correct
4. Restart Claude Code

### Connection Errors

1. Ensure protoLabs server is running: `npm run dev`
2. Check the API URL matches: `curl http://localhost:3008/api/health`
3. Verify the API key: `echo $AUTOMAKER_API_KEY`

### Authentication Errors

1. Ensure `AUTOMAKER_API_KEY` is set in both protoLabs server and plugin configuration
2. The keys must match exactly

### Tools Not Available

1. Check the health endpoint: `/board` — if it fails, start protoLabs
2. Verify MCP tools are loaded: `mcp__automaker__health_check()`

### Feature Dependencies Not Working

1. Ensure features exist before setting dependencies: `/board`
2. Check for circular dependencies: `/orchestrate`

### GitHub Operations Fail

PR-related tools require `GH_TOKEN`:

1. Get your token: `gh auth token`
2. Add to `.env`: `GH_TOKEN=gho_xxxxx`
3. Add to `plugin.json` env: `"GH_TOKEN": "${GH_TOKEN}"`
4. Restart the server and reload the plugin

### Docker-Specific Issues

**"Path not found" or "Permission denied":**

- Verify path mapping in `docker-compose.override.yml` — host and container paths must match
- Check `ALLOWED_ROOT_DIRECTORY` includes your project

**"Unauthorized" or API key errors:**

- Ensure API key matches in both `docker-compose.override.yml` and `plugin.json`
- Restart containers after changing keys: `docker compose down && docker compose up -d`

**"Cannot find module" in MCP server:**

- Ensure `plugin.json` uses absolute path in `args`
- Rebuild: `npm run build:packages`
- Reinstall plugin: `claude plugin install automaker`

**Container memory issues:**

- Check usage: `docker stats automaker-server-1`
- Increase limits in `docker-compose.override.yml`

**Third-party MCP Docker images (ARM64 vs AMD64):**

Some MCP Docker images are built only for ARM64. On Linux/AMD64, build locally:

```bash
git clone https://github.com/SaseQ/discord-mcp /tmp/discord-mcp
cd /tmp/discord-mcp
docker build --platform linux/amd64 -t discord-mcp:amd64 .
```

## Known Issues

### Recently Fixed

1. **`start_agent` now uses worktrees by default** — Agents work in isolated git worktrees
2. **`list_running_agents` endpoint** — MCP tool correctly calls `/running-agents`
3. **Auto-create worktrees for agents** — Worktrees auto-created in `{projectPath}/.worktrees/{branch-name}`

### Planned Improvements

1. Auto branchName generation (server-side in `FeatureLoader.create()`)
2. Epic UI support (progress bars, swimlanes, epic filtering)
3. Batch feature operations
4. Feature search/filter
5. Enhanced error messages

## Related Documentation

- [Plugin Commands](./plugin-commands.md) — Commands reference, subagents, examples
- [MCP Tools Reference](./mcp-tools-reference.md) — Full MCP tool catalog
- [Context System](/agents/context-system) — Best practices for context files
- [protoLabs README](../README.md) — Main project documentation
