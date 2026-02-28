# Claude Code Plugin for protoLabs

Setup guide for the Claude Code plugin and MCP server. For commands and examples, see [Plugin Commands](./plugin-commands.md). For the full MCP tool catalog, see [MCP Tools Reference](./mcp-tools-reference.md).

## Quick Start

### Option 1: Install from GitHub (Recommended)

Install directly from the GitHub repository:

```bash
# 1. Clone the repo (needed for the MCP server binary)
git clone https://github.com/proto-labs-ai/protomaker.git
cd protomaker

# 2. Add the protoLabs plugin marketplace
claude plugin marketplace add https://github.com/proto-labs-ai/protomaker/tree/main/packages/mcp-server/plugins

# 3. Install the plugin
claude plugin install protolabs

# 4. Configure the plugin — AUTOMAKER_ROOT is required
#    The plugin needs to know where your local clone lives
PLUGIN_DIR=~/.claude/plugins/protolabs
cp "$PLUGIN_DIR/.env.example" "$PLUGIN_DIR/.env"
# Edit .env and set AUTOMAKER_ROOT to the absolute path of this repo
echo "AUTOMAKER_ROOT=$(pwd)" >> "$PLUGIN_DIR/.env"
echo "AUTOMAKER_API_KEY=your-dev-key-2026" >> "$PLUGIN_DIR/.env"

# 5. Start protoLabs server (in a separate terminal)
npm install
npm run dev:web

# 6. Verify it works
claude
> /board
```

### Option 2: Install from Local Clone (Development)

For developers working on protoLabs:

```bash
# 1. Clone and install protoLabs
git clone https://github.com/proto-labs-ai/protomaker.git
cd protomaker
npm install

# 2. Build the MCP server
npm run build:packages

# 3. Add the plugin marketplace and install
claude plugin marketplace add $(pwd)/packages/mcp-server/plugins
claude plugin install protolabs

# 4. Configure the plugin — AUTOMAKER_ROOT is required
PLUGIN_DIR=~/.claude/plugins/protolabs
cp "$PLUGIN_DIR/.env.example" "$PLUGIN_DIR/.env"
echo "AUTOMAKER_ROOT=$(pwd)" > "$PLUGIN_DIR/.env"
echo "AUTOMAKER_API_KEY=your-dev-key-2026" >> "$PLUGIN_DIR/.env"

# 5. Start protoLabs server (in a separate terminal)
npm run dev:web

# 6. Verify it works
claude
> /board
```

That's it! You now have access to ~170 MCP tools and slash commands for managing your Kanban board directly from Claude Code.

### What You Can Do

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `/board`              | View and manage your Kanban board                |
| `/auto-mode`          | Start/stop autonomous feature processing         |
| `/orchestrate`        | Manage feature dependencies                      |
| `/context`            | Manage AI agent context files                    |
| `/plan-project`       | Full project orchestration pipeline              |
| `/ship`               | Stage, commit, push, create PR, auto-merge       |
| `/headsdown`          | Deep work mode — process features autonomously   |
| `/linear`             | Manage Linear projects, issues, and cycles       |
| `/create-project`     | Project orchestration from research to features  |
| `/calendar-assistant` | Calendar and scheduling operations               |
| `/due-diligence`      | Validate approaches with evidence-based research |
| `/deep-research`      | Research codebase before planning                |
| `/sparc-prd`          | Create a SPARC-style PRD                         |
| `/improve-prompts`    | Analyze and improve LLM prompts                  |

See [Plugin Commands](./plugin-commands.md) for full command reference and examples.

## Overview

The protoLabs Claude Code plugin enables you to:

- **Manage Features**: Create, update, and track features on your Kanban board
- **Control Agents**: Start, stop, and monitor AI agents working on features
- **Orchestrate Workflows**: Set up dependencies and run auto-mode for autonomous processing
- **Configure Context**: Manage context files that guide AI agent behavior

The plugin consists of:

1. **MCP Server** (`@protolabs-ai/mcp-server`) - Exposes protoLabs's API via Model Context Protocol
2. **Claude Plugin** (`packages/mcp-server/plugins/automaker`) - Provides slash commands and subagents

## Installation

### Prerequisites

- protoLabs server running (`npm run dev` from the protomaker root directory)
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

### Step 2.5: Configure the Plugin Environment

The plugin requires an environment file to locate your local protomaker clone.

```bash
# Find where Claude Code installed the plugin
PLUGIN_DIR=~/.claude/plugins/protolabs

# Create the .env from the example template
cp "$PLUGIN_DIR/.env.example" "$PLUGIN_DIR/.env"
```

Open `$PLUGIN_DIR/.env` and set `AUTOMAKER_ROOT` to the absolute path of your protomaker repository root:

```
AUTOMAKER_ROOT=/absolute/path/to/your/protomaker
AUTOMAKER_API_KEY=your-dev-key-2026
```

> **Note:** `AUTOMAKER_ROOT` must be an absolute path. Relative paths and `~` are not expanded by the plugin loader.

### Step 3: Install the Plugin

**Option A: Add via Marketplace (Recommended)**

```bash
# Add the local marketplace
claude plugin marketplace add /path/to/protomaker/packages/mcp-server/plugins

# Install the plugin
claude plugin install protolabs
```

**Option B: Symlink Directly**

```bash
# Create symlink to Claude's plugins directory
ln -s /path/to/protomaker/packages/mcp-server/plugins/automaker ~/.claude/plugins/protolabs
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

Configure these in the plugin's `.env` file (`~/.claude/plugins/protolabs/.env`).
Copy `.env.example` in that directory to get started.

| Variable             | Description                                                   | Default                 |
| -------------------- | ------------------------------------------------------------- | ----------------------- |
| `AUTOMAKER_ROOT`     | Absolute path to your local protomaker repo clone             | (required)              |
| `AUTOMAKER_API_KEY`  | API key matching the one the protoLabs server is started with | (required)              |
| `AUTOMAKER_API_URL`  | protoLabs API base URL                                        | `http://localhost:3008` |
| `GH_TOKEN`           | GitHub token for PR operations (`gh auth token` to get it)    | (optional)              |
| `DISCORD_BOT_TOKEN`  | Discord bot token for Discord MCP tools                       | (optional)              |
| `LINEAR_API_KEY`     | Linear API key for Linear MCP tools                           | (optional)              |
| `CONTEXT7_API_KEY`   | Context7 API key for documentation lookup                     | (optional)              |
| `ENABLE_TOOL_SEARCH` | Tool search mode (`auto:N` to limit active tools)             | `auto:10`               |

`AUTOMAKER_ROOT` is the most common cause of a new install failing silently. Without it, the plugin cannot locate the MCP server executable and no tools will be available.

### Plugin Configuration

The plugin configuration is in `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json`:

```json
{
  "name": "automaker",
  "description": "Automaker - AI Development Studio. Manage Kanban boards, AI agents, and feature orchestration.",
  "version": "1.1.1",
  "mcpServers": {
    "automaker": {
      "command": "bash",
      "args": ["${AUTOMAKER_ROOT}/packages/mcp-server/plugins/automaker/hooks/start-mcp.sh"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "${AUTOMAKER_API_KEY}",
        "GH_TOKEN": "${GH_TOKEN}",
        "ENABLE_TOOL_SEARCH": "auto:10"
      }
    }
  }
}
```

The MCP server is launched via `start-mcp.sh` which handles path resolution and env loading automatically.

## Docker Deployment

For production deployments using Docker, follow these steps to configure the MCP plugin to communicate with a containerized protoLabs server.

### Prerequisites

- Docker and Docker Compose installed
- protoLabs repository cloned
- Claude Code CLI installed

### Step 1: Configure docker-compose.override.yml

Create `docker-compose.override.yml` in the protomaker root directory:

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

Create or update `.env` in the protomaker root directory:

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

### Step 3: Update Plugin Environment

Set `AUTOMAKER_ROOT` in the plugin `.env` to point at your protomaker clone. The `start-mcp.sh` launcher handles path resolution from there:

```bash
PLUGIN_DIR=~/.claude/plugins/protolabs
echo "AUTOMAKER_ROOT=/absolute/path/to/protomaker" > "$PLUGIN_DIR/.env"
echo "AUTOMAKER_API_KEY=your-secure-api-key" >> "$PLUGIN_DIR/.env"
```

### Step 4: Build and Start

```bash
npm run build:packages
docker compose up -d
curl http://localhost:3008/api/health
```

### Step 5: Install/Reinstall Plugin

```bash
claude plugin marketplace add /path/to/protomaker/packages/mcp-server/plugins
claude plugin install protolabs
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

### AUTOMAKER_ROOT Not Set

**Symptom:** No MCP tools appear in Claude Code. Session start prints `AUTOMAKER_ROOT is not set`.

**Fix:**

```bash
PLUGIN_DIR=~/.claude/plugins/protolabs
cp "$PLUGIN_DIR/.env.example" "$PLUGIN_DIR/.env"
# Open .env and set AUTOMAKER_ROOT to the absolute path of your protomaker clone
echo "AUTOMAKER_ROOT=/absolute/path/to/protomaker" >> "$PLUGIN_DIR/.env"
echo "AUTOMAKER_API_KEY=your-dev-key-2026" >> "$PLUGIN_DIR/.env"
```

Restart Claude Code after editing `.env`.

### MCP Server Binary Not Found

**Symptom:** `AUTOMAKER_ROOT` is set but session start prints `MCP server binary not found`.

**Fix:** The MCP server has not been built yet.

```bash
cd "$AUTOMAKER_ROOT"
npm run build:packages
```

Then restart Claude Code.

### Plugin Not Loading (General)

If neither of the above applies:

1. Verify the plugin is installed: `ls ~/.claude/plugins/`
2. Check `~/.claude/plugins/protolabs/.env` exists and contains `AUTOMAKER_ROOT`
3. Confirm `AUTOMAKER_ROOT` points to the correct repo: `ls "$AUTOMAKER_ROOT/packages/mcp-server/dist/index.js"`
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
2. Verify MCP tools are loaded: `mcp__protolabs__health_check()`

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
- Reinstall plugin: `claude plugin install protolabs`

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

## Related Documentation

- [Plugin Commands](./plugin-commands.md) — Commands reference, subagents, examples
- [MCP Tools Reference](./mcp-tools-reference.md) — Full MCP tool catalog
- [Context System](/agents/context-system) — Best practices for context files
- [protoLabs README](../README.md) — Main project documentation
