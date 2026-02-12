# Claude Code Plugin for Automaker

Comprehensive guide to using the Claude Code plugin and MCP server for programmatic control of Automaker.

## Quick Start

### Option 1: Install from GitHub (Recommended)

Install directly from the GitHub repository:

```bash
# 1. Add the Automaker plugin marketplace from GitHub
claude plugin marketplace add https://github.com/proto-labs-ai/automaker/tree/main/packages/mcp-server/plugins

# 2. Install the plugin
claude plugin install automaker

# 3. Start Automaker server (in a separate terminal)
git clone https://github.com/proto-labs-ai/automaker.git
cd automaker
npm install
npm run dev:web

# 4. Verify it works
claude
> /board
```

### Option 2: Install from Local Clone (Development)

For developers working on Automaker:

```bash
# 1. Clone and install Automaker
git clone https://github.com/proto-labs-ai/automaker.git
cd automaker
npm install

# 2. Build the MCP server
npm run build:packages

# 3. Start Automaker server
npm run dev:web

# 4. In a new terminal, add the plugin marketplace and install
claude plugin marketplace add $(pwd)/packages/mcp-server/plugins
claude plugin install automaker

# 5. Verify it works
claude
> /board
```

That's it! You now have access to 32 MCP tools and slash commands for managing your Kanban board directly from Claude Code.

### What You Can Do

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `/board`           | View and manage your Kanban board    |
| `/auto-mode start` | Start autonomous feature processing  |
| `/orchestrate`     | Manage feature dependencies          |
| `/context`         | Manage AI agent context files        |
| `/groom`           | Review and organize the board        |
| `/pr-review`       | Review and manage open pull requests |
| `/create-project`  | Full project orchestration pipeline  |
| `/cleanup`         | Codebase maintenance and hygiene     |

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Commands Reference](#commands-reference)
- [Subagents](#subagents)
- [MCP Tools Reference](#mcp-tools-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Automaker Claude Code plugin enables you to:

- **Manage Features**: Create, update, and track features on your Kanban board
- **Control Agents**: Start, stop, and monitor AI agents working on features
- **Orchestrate Workflows**: Set up dependencies and run auto-mode for autonomous processing
- **Configure Context**: Manage context files that guide AI agent behavior

The plugin consists of:

1. **MCP Server** (`@automaker/mcp-server`) - Exposes Automaker's API via Model Context Protocol
2. **Claude Plugin** (`packages/mcp-server/plugins/automaker`) - Provides slash commands and subagents

## Installation

### Prerequisites

- Automaker server running (`npm run dev` from the automaker root directory)
- Claude Code CLI installed and authenticated
- Node.js 22+

### Step 1: Start Automaker with a Fixed API Key

By default, Automaker generates a random API key on each restart. For Claude Code integration, use a fixed key:

```bash
# Start Automaker with a fixed API key
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

You should see your Kanban board or a message to start the Automaker server.

## Configuration

### Environment Variables

Configure these in your shell or the plugin's `plugin.json`:

| Variable            | Description                | Default                 |
| ------------------- | -------------------------- | ----------------------- |
| `AUTOMAKER_API_URL` | Automaker API base URL     | `http://localhost:3008` |
| `AUTOMAKER_API_KEY` | API key for authentication | (required)              |

### Plugin Configuration

The plugin configuration is in `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json`:

```json
{
  "name": "automaker",
  "description": "Automaker - AI Development Studio",
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

For production deployments using Docker, follow these steps to configure the MCP plugin to communicate with a containerized Automaker server.

### Prerequisites

- Docker and Docker Compose installed
- Automaker repository cloned
- Claude Code CLI installed

### Step 1: Configure docker-compose.override.yml

Create `docker-compose.override.yml` in the automaker root directory:

```yaml
# Automaker Production Override
# Mounts host project directories for development work

services:
  server:
    environment:
      # Allow access to host dev directory (same path mapping)
      - ALLOWED_ROOT_DIRECTORY=/home/youruser/dev
      # API key for MCP plugin
      - AUTOMAKER_API_KEY=your-secure-api-key

    volumes:
      # Mount dev directory with SAME PATH so MCP paths work
      # CRITICAL: The container path must match the host path exactly
      - /home/youruser/dev:/home/youruser/dev:rw

      # Keep the named volumes from base compose
      - automaker-data:/data
      - automaker-claude-config:/home/automaker/.claude
      - automaker-cursor-config:/home/automaker/.cursor
      - automaker-opencode-data:/home/automaker/.local/share/opencode
      - automaker-opencode-config:/home/automaker/.config/opencode
      - automaker-opencode-cache:/home/automaker/.cache/opencode

    deploy:
      resources:
        limits:
          memory: 8G # Adjust based on expected concurrent agents
        reservations:
          memory: 4G
```

**Important Path Mapping Note:** The MCP plugin runs on the host and passes paths like `/home/youruser/dev/myproject` to the containerized server. For this to work, the container must have the exact same path available. This is why we mount `/home/youruser/dev:/home/youruser/dev:rw` (same path on both sides).

### Step 2: Configure .env File

Create or update `.env` in the automaker root directory:

```bash
# API Authentication
AUTOMAKER_API_KEY=your-secure-api-key

# Docker user/group IDs (match host for volume permissions)
UID=1000
GID=1000

# Server Configuration
HOST=0.0.0.0
PORT=3008
CORS_ORIGIN=http://localhost:3007

# Allow access to all projects under your dev directory
ALLOWED_ROOT_DIRECTORY=/home/youruser/dev

# UI Configuration
VITE_HOSTNAME=localhost
```

### Step 3: Update Plugin Configuration

Edit `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json` to use absolute paths:

```json
{
  "name": "automaker",
  "description": "Automaker - AI Development Studio",
  "version": "1.0.2",
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["/absolute/path/to/automaker/packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_URL": "http://localhost:3008",
        "AUTOMAKER_API_KEY": "your-secure-api-key"
      }
    }
  }
}
```

**Note:** The `args` path must be absolute (e.g., `/home/youruser/dev/automaker/packages/mcp-server/dist/index.js`), not relative. This ensures the MCP server can be found regardless of your current working directory.

### Step 4: Build and Start

```bash
# Build packages including MCP server
npm run build:packages

# Start Docker containers
docker compose up -d

# Verify server is running
curl http://localhost:3008/api/health
```

### Step 5: Install/Reinstall Plugin

```bash
# Add the plugin marketplace
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins

# Install (or reinstall to pick up changes)
claude plugin install automaker
```

### Step 6: Verify

Test the connection from any project directory:

```bash
cd /home/youruser/dev/myproject
claude
> /board
```

### Memory Allocation Guidelines

Adjust Docker memory limits based on your workload:

| Use Case                       | Memory Limit | Reservation |
| ------------------------------ | ------------ | ----------- |
| Light (1-2 concurrent agents)  | 4G           | 2G          |
| Medium (3-5 concurrent agents) | 8G           | 4G          |
| Heavy (6+ concurrent agents)   | 16G          | 8G          |

### Working with Multiple Projects

With the path mapping configuration above, you can use Automaker with any project under your `ALLOWED_ROOT_DIRECTORY`:

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

---

## Commands Reference

### /board

View and manage the Automaker Kanban board.

```bash
/board                    # Show board overview with feature counts
/board create             # Create a new feature interactively
/board [feature-id]       # Show details for a specific feature
/board agent-output       # Review what an agent did on a feature
```

**Capabilities:**

- View all features organized by status (backlog, in-progress, review, done)
- Create new features with detailed descriptions
- Move features between columns
- Start/stop AI agents on features
- Review agent output and changes

**Example:**

```
/board create

> What should this feature do?
Add a dark mode toggle to the settings page. It should:
- Add a toggle switch in Settings > Appearance
- Save preference to localStorage
- Apply theme immediately without page reload
```

### /auto-mode

Control autonomous feature processing.

```bash
/auto-mode start          # Start auto-mode with configuration prompts
/auto-mode stop           # Stop auto-mode gracefully
/auto-mode status         # Check if auto-mode is running
```

**How Auto-Mode Works:**

1. Picks up features from backlog that have no unmet dependencies
2. Starts an AI agent to implement each feature
3. Moves completed features to review
4. Picks up the next available feature
5. Repeats until backlog is empty or stopped

**Example:**

```
/auto-mode start

> How many features should run concurrently?
1. 1 (Sequential) - Safest, one agent at a time
2. 2 (Parallel) - Faster, two agents working simultaneously
3. 3+ (High Parallelism) - Maximum speed, requires more resources

[Select: 2]

Auto-mode started with concurrency: 2
Processing:
  - [abc-123] Add user authentication
  - [def-456] Create database schema
```

### /orchestrate

Manage feature dependencies and execution order.

```bash
/orchestrate              # View the dependency graph
/orchestrate [feature]    # Set dependencies for a specific feature
/orchestrate order        # Show resolved execution order
```

**Dependency Concepts:**

- Features can depend on other features
- A feature won't start until all its dependencies are "done"
- Use this to ensure proper implementation order

**Example:**

```
/orchestrate

## Dependency Graph

### Independent Features (can start immediately)
- [abc-123] Database Schema

### Dependency Chains
[abc-123] Database Schema
  └── [def-456] User Authentication
        ├── [ghi-789] User Dashboard
        └── [jkl-012] User Profile
```

### /context

Manage context files for AI agents.

```bash
/context                  # List all context files
/context add              # Add a new context file
/context [filename]       # View a specific context file
/context spec             # View or edit the project spec
```

**What Are Context Files?**

Context files live in `.automaker/context/` and are automatically injected into every AI agent's prompt. Use them for:

- Coding standards and style guides
- Architectural patterns to follow
- Testing requirements
- Project-specific rules

**Example:**

```
/context add

> What kind of guidance do you want to add?
1. Coding Standards
2. Testing Requirements
3. Architecture Guidelines
4. Custom Rules

[Select: 1]

Creating coding-standards.md...

> Enter your coding standards:
# TypeScript Conventions
- Use explicit return types on all functions
- Prefer interfaces over type aliases for objects
- Use const assertions for literals
```

### /groom

Review and organize your Kanban board for health and maintenance.

```bash
/groom                    # Run full board grooming
/groom quick              # Quick status check
```

**What It Does:**

- Shows board summary (backlog, in-progress, review, done counts)
- Identifies stale features (no activity > 24 hours)
- Checks for blocked features with unmet dependencies
- Suggests next actions based on board state
- Provides cleanup recommendations

**Example Output:**

```
## 🧹 Board Grooming Report

### 📊 Board Status
- Backlog: 15 features
- In Progress: 2 features
- Review: 0 features
- Done: 48 features

### ⏱️ Stale Features
No stale features found!

### 🚫 Blockers
- [feature-xyz] blocked by [feature-abc]

### 💡 Recommended Actions
1. Start agents on 3 ready features in backlog
2. Review and merge completed features
```

### /pr-review

Systematically review and organize open pull requests.

```bash
/pr-review                # Review all open PRs
/pr-review [pr-number]    # Review specific PR
```

**What It Does:**

- Lists all open PRs with status (CodeRabbit checks, CI, conflicts)
- Checks PR alignment (features→epics, epics→main)
- Identifies merge conflicts
- Suggests merge order based on dependencies
- Finds branches with work but no PR

**Example Output:**

```
## Pull Request Review

### ✅ Ready to Merge (3)
- #123: Add user authentication (all checks passed)
- #124: Update database schema (approved, no conflicts)

### ⏳ Waiting on Review (2)
- #125: Add dashboard UI (CodeRabbit reviewing)

### ⚠️ Needs Attention (1)
- #126: Refactor API (merge conflicts with main)

### 💡 Recommended Merge Order
1. Merge #123 (blocks #127, #128)
2. Merge #124 (independent)
3. Resolve #126 conflicts
```

### /create-project

Full project orchestration pipeline from research to implementation.

```bash
/create-project           # Start project planning wizard
/create-project [idea]    # Quick start with an idea
```

**Workflow:**

1. **Deep Research** - Analyzes codebase, identifies patterns
2. **SPARC PRD** - Creates structured requirements document
3. **Review** - User approves PRD
4. **Scaffold** - Creates project directory structure
5. **Create Features** - Generates Kanban board features with dependencies

**Example:**

```
/create-project "Add real-time collaboration features"

## Phase 1: Deep Research
📊 Analyzing codebase...
✅ Found WebSocket infrastructure in place
✅ Identified state management patterns (Zustand)
⚠️ No existing real-time sync mechanism

## Phase 2: SPARC PRD
Creating requirements document...
- Situation: Users want real-time collaboration
- Problem: No sync mechanism for multi-user edits
- Approach: WebSocket-based operational transforms
...

[User reviews and approves PRD]

## Phase 3: Scaffolding
Creating project structure in .automaker/projects/real-time-collab/

## Phase 4: Feature Creation
Created 12 features with dependencies:
- [Epic] Real-time Sync Infrastructure
- WebSocket event types
- Operational transform service
...

Ready to start auto-mode!
```

### /cleanup

Comprehensive codebase maintenance and hygiene check.

```bash
/cleanup                  # Full cleanup report
/cleanup docs             # Documentation only
/cleanup git              # Git hygiene only
```

**What It Checks:**

- **Documentation**: status.md, CLAUDE.md, README.md currency
- **Git Hygiene**: Merged branches, stale worktrees, orphaned branches
- **Dependencies**: npm audit, outdated packages
- **Code Quality**: TODO comments, console.logs, unused imports
- **Test Coverage**: Missing tests, commented tests

**Example Output:**

````
## 🧹 Codebase Cleanup Report

### 📝 Documentation Status
✅ status.md - Updated
⚠️ CLAUDE.md - Needs minor updates
✅ README.md - Current

### 🌳 Git Hygiene
- Found 23 merged branches (cleanup recommended)
- No stale worktrees
- 12 remote branches with no PRs

### 📦 Dependencies
- npm audit: 12 vulnerabilities (address recommended)
- 5 outdated packages

### 🎯 Quick Cleanup Commands
```bash
# Delete merged branches
git branch --merged main | xargs git branch -d

# Fix vulnerabilities
npm audit fix
````

**Cleanup Scorecard:** 8/10 - Healthy codebase

````

## Subagents

The plugin includes specialized agents for complex tasks. Invoke them via the `Task` tool:

### automaker:feature-planner

Breaks down complex features into smaller, implementable tasks with proper dependencies.

**When to Use:**

- Planning a large feature with multiple components
- Need help identifying the right task breakdown
- Want to set up dependencies automatically

**Example:**

```javascript
Task(subagent_type: "automaker:feature-planner",
     prompt: "Project: /path/to/project.
              Feature: Add a complete user authentication system with:
              - Login/logout
              - Registration
              - Password reset
              - Email verification
              Context: Using React and Express with PostgreSQL.")
````

**Output:**

```
## Feature Breakdown Complete

**Original Request:** User authentication system

**Created Tasks:**
| Order | Task | Dependencies |
|-------|------|--------------|
| 1 | Add User model and types | - |
| 2 | Create auth service | #1 |
| 3 | Add login/logout endpoints | #2 |
| 4 | Add registration endpoint | #2 |
| 5 | Build login form UI | #3 |
| 6 | Build registration form UI | #4 |
| 7 | Add password reset flow | #3 |
| 8 | Add email verification | #4 |
```

### automaker:agent-reviewer

Reviews completed agent work and provides feedback.

**When to Use:**

- After an agent completes a feature
- Need a code quality assessment
- Want security or performance review

**Example:**

```javascript
Task(subagent_type: "automaker:agent-reviewer",
     prompt: "Project: /path/to/project.
              Feature ID: abc-123.
              Focus: security, code quality, tests")
```

**Output:**

```
## Review: Add User Authentication

### Summary
Implementation follows project patterns. One security issue found.

### Status Recommendation
- [x] **Request Changes**: Issues must be fixed

### Critical Issues
1. **Password not hashed** - `src/services/auth.ts:42`
   - Problem: Storing plaintext password
   - Suggestion: Use bcrypt with salt rounds >= 12

### Acceptance Criteria Check
- [x] Login endpoint works
- [x] Registration endpoint works
- [ ] Passwords are hashed - NOT MET
```

### automaker:codebase-analyzer

Analyzes codebase structure, patterns, and suggests feature dependencies.

**When to Use:**

- Understanding a new codebase
- Planning optimal feature execution order
- Analyzing impact of changes

**Example:**

```javascript
Task(subagent_type: "automaker:codebase-analyzer",
     prompt: "Project: /path/to/project.
              Review backlog features and suggest optimal dependencies.")
```

**Output:**

```
## Codebase Analysis

### Architecture Overview
src/
├── components/     # React components (47 files)
├── hooks/          # Custom hooks (12 files)
├── services/       # API clients (8 files)
├── types/          # TypeScript types (15 files)
└── utils/          # Utilities (6 files)

### Suggested Dependencies
Feature: Add User Dashboard
  Depends on:
  1. User types (shared types)
  2. User API service (data fetching)

### Optimal Execution Order
Wave 1: [Types, Models] - foundational
Wave 2: [Services, APIs] - depends on types
Wave 3: [UI Components] - parallel work
```

## MCP Tools Reference

The MCP server exposes 32 tools organized by category:

### Feature Management

| Tool             | Description                                      |
| ---------------- | ------------------------------------------------ |
| `list_features`  | List all features, optionally filtered by status |
| `get_feature`    | Get detailed info about a specific feature       |
| `create_feature` | Create a new feature on the board                |
| `update_feature` | Update feature properties                        |
| `delete_feature` | Delete a feature                                 |
| `move_feature`   | Move feature to a different column               |

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

## Examples

### Creating a Feature via Claude Code

```
User: Create a feature to add a dark mode toggle

Claude: I'll create that feature for you.

[Calls mcp__automaker__create_feature with:
  projectPath: "/path/to/project"
  title: "Add dark mode toggle"
  description: "## Overview
Add a dark mode toggle to the application settings.

## Requirements
- Add toggle switch in Settings > Appearance
- Save preference to localStorage
- Apply theme immediately without page reload
- Support system preference detection

## Acceptance Criteria
- [ ] Toggle appears in settings
- [ ] Theme changes immediately on toggle
- [ ] Preference persists across sessions"
  status: "backlog"]

Created feature: dark-mode-toggle (ID: abc-123)
```

### Setting Up Dependencies

```
User: The dashboard feature should depend on the auth feature

Claude: I'll set up that dependency.

[Calls mcp__automaker__set_feature_dependencies with:
  projectPath: "/path/to/project"
  featureId: "dashboard-id"
  dependencies: ["auth-id"]]

Dependency set: Dashboard now depends on Authentication.
Dashboard will not start until Authentication is marked Done.
```

### Running Auto-Mode

```
User: Start auto-mode with 2 concurrent agents

Claude: Starting auto-mode...

[Calls mcp__automaker__start_auto_mode with:
  projectPath: "/path/to/project"
  maxConcurrency: 2]

Auto-mode started!
- Concurrency: 2 agents
- Features in backlog: 5
- First features starting:
  1. [abc-123] Add user types
  2. [def-456] Create database schema
```

### Reviewing Agent Work

```
User: What did the agent do on the auth feature?

Claude: Let me check the agent output.

[Calls mcp__automaker__get_agent_output with:
  projectPath: "/path/to/project"
  featureId: "auth-id"]

## Agent Output: User Authentication

**Status:** Completed
**Duration:** 12 minutes

### Files Changed
- src/services/auth.ts (created)
- src/types/user.ts (created)
- src/routes/auth.ts (created)
- tests/auth.test.ts (created)

### Summary
- Created User type with id, email, passwordHash, createdAt
- Implemented AuthService with login, logout, register methods
- Added /api/auth/login and /api/auth/register endpoints
- Added unit tests with 85% coverage
```

## Troubleshooting

### Plugin Not Loading

1. Verify the MCP server is built:

   ```bash
   cd packages/mcp-server && npm run build
   ```

2. Check the plugin is installed:

   ```bash
   ls ~/.claude/plugins/
   ```

3. Verify the symlink or marketplace entry is correct

4. Restart Claude Code

### Connection Errors

1. Ensure Automaker server is running:

   ```bash
   npm run dev
   ```

2. Check the API URL matches:

   ```bash
   # Default: http://localhost:3008
   curl http://localhost:3008/api/health
   ```

3. Verify the API key:
   ```bash
   # Should match what's set in Automaker
   echo $AUTOMAKER_API_KEY
   ```

### Authentication Errors

1. Ensure `AUTOMAKER_API_KEY` is set in both:
   - Automaker server (via env or .env file)
   - Plugin configuration (plugin.json)

2. The keys must match exactly

### Tools Not Available

1. Check the health endpoint:

   ```
   /board
   ```

   If it fails with "server not running", start Automaker.

2. Verify MCP tools are loaded:
   ```bash
   # In Claude Code, try calling a tool directly
   mcp__automaker__health_check()
   ```

### Feature Dependencies Not Working

1. Ensure features exist before setting dependencies:

   ```
   /board
   ```

2. Check for circular dependencies:
   ```
   /orchestrate
   ```
   The graph view will show any cycles.

### Docker-Specific Issues

**"Path not found" or "Permission denied" errors:**

1. Verify path mapping in `docker-compose.override.yml`:

   ```yaml
   volumes:
     # Host path and container path MUST match
     - /home/youruser/dev:/home/youruser/dev:rw
   ```

2. Check `ALLOWED_ROOT_DIRECTORY` includes your project:
   ```bash
   docker exec automaker-server-1 env | grep ALLOWED_ROOT
   ```

**"Unauthorized" or API key errors:**

1. Ensure API key is set in both places:
   - `docker-compose.override.yml` (environment section)
   - `plugin.json` (env section)

2. Verify they match exactly:

   ```bash
   # Check container
   docker exec automaker-server-1 env | grep AUTOMAKER_API_KEY

   # Check plugin
   cat packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json | grep API_KEY
   ```

3. Restart containers after changing keys:
   ```bash
   docker compose down && docker compose up -d
   ```

**"Cannot find module" in MCP server:**

1. Ensure plugin.json uses absolute path:

   ```json
   "args": ["/home/youruser/dev/automaker/packages/mcp-server/dist/index.js"]
   ```

2. Rebuild MCP server:

   ```bash
   npm run build:packages
   ```

3. Reinstall plugin:
   ```bash
   claude plugin install automaker
   ```

**Container memory issues:**

1. Check current memory usage:

   ```bash
   docker stats automaker-server-1
   ```

2. Increase limits in `docker-compose.override.yml`:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 16G
   ```

**Third-party MCP Docker images (ARM64 vs AMD64):**

Some MCP Docker images (e.g., `saseq/discord-mcp`) are built only for ARM64 (Mac). On Linux/AMD64 you'll see:

```
WARNING: The requested image's platform (linux/arm64/v8) does not match the detected host platform (linux/amd64/v3)
```

Solution: Build locally for your platform:

```bash
# Clone the MCP repo
git clone https://github.com/SaseQ/discord-mcp /tmp/discord-mcp
cd /tmp/discord-mcp

# Build for AMD64
docker build --platform linux/amd64 -t discord-mcp:amd64 .

# Configure Claude to use local image
claude mcp add discord -s user -- docker run --rm -i \
  -e "DISCORD_TOKEN=<your-token>" \
  -e "DISCORD_GUILD_ID=<your-guild-id>" \
  discord-mcp:amd64
```

## Development

### Modifying the Plugin

1. Edit files in `packages/mcp-server/plugins/automaker/`
2. Restart Claude Code to pick up changes

### Adding New Commands

Create a new markdown file in `commands/`:

```yaml
---
name: my-command
description: What this command does
argument-hint: (optional arguments)
allowed-tools:
  - mcp__automaker__tool_name
---
# Command Instructions

Your prompt content here...
```

### Adding New Subagents

Create a new markdown file in `agents/`:

```yaml
---
name: my-agent
description: What this agent does
allowed-tools:
  - Read
  - Write
  - mcp__automaker__tool_name
model: sonnet
---
# Agent Instructions

Your agent prompt here...
```

## Project Orchestration

The project orchestration system enables hierarchical project planning with a single command workflow.

### The Orchestration Flow

```
/create-project "Add user authentication"
    │
    ├── 1. Deep Research (Explore agent)
    │   └── Analyze codebase, patterns, integration points
    │
    ├── 2. SPARC PRD Creation
    │   └── Generate PRD with Situation, Problem, Approach, Results, Constraints
    │
    ├── 3. Milestone & Phase Planning
    │   └── Break down into implementable phases (~30-60 min each)
    │
    ├── 4. Project Scaffolding
    │   └── Create .automaker/projects/{slug}/ structure
    │
    └── 5. Feature Creation
        └── Convert phases to board features with epics and dependencies
```

### Using Project Tools

```
User: Create a project for adding user authentication

Claude: I'll set up a complete project plan for user authentication.

[Calls mcp__automaker__create_project with:
  projectPath: "/path/to/project"
  title: "User Authentication System"
  goal: "Add secure user authentication with login, registration, and session management"
  prd: {
    situation: "The application currently has no authentication...",
    problem: "Users cannot securely access protected resources...",
    approach: "Implement JWT-based auth with bcrypt password hashing...",
    results: "Secure authentication with login, register, logout, and session refresh",
    constraints: ["Must be backwards compatible", "No database schema breaking changes"]
  }
  milestones: [
    {
      title: "Foundation",
      description: "Core auth infrastructure",
      phases: [
        {
          title: "Add User Types",
          description: "Create User and Session TypeScript types",
          filesToModify: ["src/types/user.ts", "src/types/session.ts"],
          acceptanceCriteria: ["Types compile", "Exported from index"],
          complexity: "small"
        },
        {
          title: "Create Auth Service",
          description: "Implement AuthService with login, logout, register methods",
          filesToModify: ["src/services/auth.ts"],
          acceptanceCriteria: ["All methods implemented", "Password hashing works"],
          complexity: "medium"
        }
      ]
    },
    {
      title: "API Endpoints",
      description: "REST API for authentication",
      phases: [
        {
          title: "Auth Routes",
          description: "Add /api/auth/login, /api/auth/register, /api/auth/logout",
          filesToModify: ["src/routes/auth.ts"],
          acceptanceCriteria: ["Endpoints respond correctly", "Validation works"],
          complexity: "medium"
        }
      ]
    }
  ]]

Project created: user-authentication-system

[Calls mcp__automaker__create_project_features with:
  projectPath: "/path/to/project"
  projectSlug: "user-authentication-system"
  createEpics: true
  setupDependencies: true]

Created:
- 2 epics (Foundation, API Endpoints)
- 3 phase features with dependencies
- Features ready in backlog for auto-mode
```

### Project Structure

After creation, the project files are organized as:

```
.automaker/projects/user-authentication-system/
├── project.md           # High-level overview
├── project.json         # Full structured data
├── prd.md              # SPARC PRD document
└── milestones/
    ├── 01-foundation/
    │   ├── milestone.md
    │   ├── phase-01-add-user-types.md
    │   └── phase-02-create-auth-service.md
    └── 02-api-endpoints/
        ├── milestone.md
        └── phase-01-auth-routes.md
```

### Epic Features

When `createEpics: true`, each milestone becomes an epic feature:

- **[Epic] Foundation** - Container for foundation phases
  - Add User Types (depends on nothing)
  - Create Auth Service (depends on Add User Types)
- **[Epic] API Endpoints** - Container for API phases
  - Auth Routes (depends on Create Auth Service)

Epics provide visual grouping on the Kanban board and help track milestone progress.

## Known Issues & Improvements

### Recently Fixed

1. **`start_agent` now uses worktrees by default** (Fixed)
   - Agents now work in isolated git worktrees instead of directly on main
   - Added `useWorktrees` parameter to `start_agent` tool (defaults to `true`)

2. **`list_running_agents` endpoint** (Fixed)
   - MCP tool now correctly calls `/running-agents` endpoint

3. **Auto-create worktrees for agents** (Fixed)
   - Agents now automatically create git worktrees if one doesn't exist for the feature's branch
   - Worktrees are created in `{projectPath}/.worktrees/{branch-name}`
   - No manual worktree creation required - just start an agent and isolation is automatic

### Planned Improvements

1. **Auto branchName generation**
   - Server-side generation in FeatureLoader.create()
   - Format: `feature/{slugified-title}-{shortId}`

2. **Epic UI support**
   - Progress bars, swimlanes, epic filtering
   - Collapsible epic groups in list view

3. **Batch feature operations**
   - Bulk update multiple features at once
   - Bulk dependency setting

4. **Feature search/filter**
   - Filter by title, category, dependencies
   - Search within feature descriptions

5. **Enhanced error messages**
   - More detailed error categorization
   - Actionable error responses

### Model Assignment Reference

| Component            | Model  | Rationale               |
| -------------------- | ------ | ----------------------- |
| `/deep-research`     | Haiku  | Fast exploration        |
| `/codebase-analyzer` | Haiku  | Quick pattern detection |
| `/project-scaffold`  | Haiku  | Simple file operations  |
| `/feature-factory`   | Haiku  | Straightforward parsing |
| `/create-project`    | Sonnet | Complex orchestration   |
| `/sparc-prd`         | Sonnet | Sophisticated analysis  |
| `/feature-planner`   | Sonnet | Architectural decisions |
| `/agent-reviewer`    | Sonnet | Code quality judgment   |
| `/prd-reviewer`      | Sonnet | PRD validation          |

## Related Documentation

- [Automaker README](../README.md) - Main project documentation
- [MCP Server README](../packages/mcp-server/README.md) - MCP server technical details
- [Context Files Guide](context-files-pattern.md) - Best practices for context files
