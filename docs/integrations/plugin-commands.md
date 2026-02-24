# Plugin Commands & Examples

Commands reference, subagents, and step-by-step examples for the protoLabs Claude Code plugin.

For installation and configuration, see [Claude Plugin Setup](./claude-plugin.md). For the full MCP tool catalog, see [MCP Tools Reference](./mcp-tools-reference.md).

## Commands Reference

### /board

View and manage the protoLabs Kanban board.

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

### /plan-project

Full project lifecycle from research to launch. Works with Linear as source of truth or standalone.

```bash
/plan-project             # Start project planning wizard
/plan-project [idea]      # Quick start with an idea
```

**Workflow:**

1. **Research** - Analyzes codebase, identifies patterns (optional)
2. **Dedup** - Checks for duplicate projects in Linear
3. **SPARC PRD** - Creates structured requirements document
4. **Milestones** - Breaks into phases with sizing guidance
5. **Features** - Creates board features with dependencies
6. **Launch** - Starts auto-mode

Supports resuming mid-stream — re-running picks up where you left off.

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

## Subagents

The plugin includes specialized agents for complex tasks. Invoke them via the `Task` tool.

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

### automaker:codebase-analyzer

Analyzes codebase structure, patterns, and suggests feature dependencies.

**When to Use:**

- Understanding a new codebase
- Planning optimal feature execution order
- Analyzing impact of changes

### Model Assignment Reference

| Component            | Model  | Rationale               |
| -------------------- | ------ | ----------------------- |
| `/deep-research`     | Haiku  | Fast exploration        |
| `/codebase-analyzer` | Haiku  | Quick pattern detection |
| `/project-scaffold`  | Haiku  | Simple file operations  |
| `/feature-factory`   | Haiku  | Straightforward parsing |
| `/plan-project`      | Sonnet | Complex orchestration   |
| `/sparc-prd`         | Sonnet | Sophisticated analysis  |
| `/feature-planner`   | Sonnet | Architectural decisions |
| `/agent-reviewer`    | Sonnet | Code quality judgment   |
| `/prd-reviewer`      | Sonnet | PRD validation          |

## Step-by-Step Examples

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

## Development

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

## Related Documentation

- [Claude Plugin Setup](./claude-plugin.md) — Installation, configuration, Docker deployment
- [MCP Tools Reference](./mcp-tools-reference.md) — Full MCP tool catalog
- [Context System](/agents/context-system) — Best practices for context files
