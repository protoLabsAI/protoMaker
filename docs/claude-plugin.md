# Claude Code Plugin for Automaker

Comprehensive guide to using the Claude Code plugin and MCP server for programmatic control of Automaker.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
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
```

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

### Current Issues

1. **`list_running_agents` endpoint mismatch**
   - MCP tool calls `/running-agents/list` but server routing may differ
   - Ticket: `feature-1770231844451-cj4ovhl44`

2. **`start_agent` sessionId parameter**
   - Tool calls `/auto-mode/run-feature` without required sessionId
   - Ticket: `feature-1770231974074-du2xki49d`

3. **No auto-generated branchName**
   - Features created via MCP don't get isolated worktrees
   - Critical for avoiding conflicts on main branch

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
