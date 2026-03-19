# Plugin Commands & Examples

Commands reference, subagents, and step-by-step examples for the protoLabs Claude Code plugin.

For installation and configuration, see [Claude Plugin Setup](./claude-plugin.md). For the full MCP tool catalog, see [MCP Tools Reference](../reference/mcp-tools.md).

## Commands Reference

### /welcome

User onboarding and status refresh. Detects your setup state, collects identity, orients you to the board, helps create a first feature, and prints a command reference card. Safe to re-run — skips phases you've already completed.

```bash
/welcome                  # Run onboarding (or refresh your status)
```

**5-Phase Flow:**

1. **Preflight** -- Health check, fetch settings, detect CWD project
2. **Identity** -- Name and role (skipped if profile exists)
3. **Orientation** -- Board status, context files, project spec (or offer to initialize)
4. **First Action** -- Create a real feature from your description (skipped if board has 3+ features)
5. **Reference Card** -- Command cheat sheet and key concepts

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
  |-- [def-456] User Authentication
        |-- [ghi-789] User Dashboard
        |-- [jkl-012] User Profile
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

### /plan-project

Full project lifecycle from research to launch.

```bash
/plan-project             # Start project planning wizard
/plan-project [idea]      # Quick start with an idea
```

**Workflow:**

1. **Research** - Analyzes codebase, identifies patterns (optional)
2. **Dedup** - Checks for duplicate projects
3. **SPARC PRD** - Creates structured requirements document
4. **Milestones** - Breaks into phases with sizing guidance
5. **Features** - Creates board features with dependencies
6. **Launch** - Starts auto-mode

Supports resuming mid-stream -- re-running picks up where you left off.

### /ship

Ship current changes with full git workflow automation.

```bash
/ship                     # Stage, commit, push, create PR, auto-merge
```

**What It Does:**

- Stages all changes
- Creates a commit with a descriptive message
- Pushes to remote
- Creates a PR targeting the correct base branch
- Enables auto-merge
- Handles conflicts automatically

### /headsdown

Deep work mode for autonomous feature processing.

```bash
/headsdown                # Enter deep work mode
```

**What It Does:**

- Autonomously processes features from the backlog
- Merges approved PRs
- Grooms the board
- Stays productive until the system is void of work
- Minimal human interaction required

### /due-diligence

Validate approaches and question architectures with evidence-based research.

```bash
/due-diligence            # Start validation session
/due-diligence [topic]    # Validate a specific approach
```

**What It Does:**

- Evaluates technology choices
- Compares alternative solutions
- Questions architectural decisions with evidence
- Provides risk assessment

### /deep-research

Research codebase before planning a feature.

```bash
/deep-research            # Start codebase research
/deep-research [topic]    # Research a specific area
```

**What It Does:**

- Gathers context about codebase structure
- Identifies patterns and conventions
- Documents constraints and dependencies
- Prepares context for feature planning

### /sparc-prd

Create a SPARC-style Product Requirements Document.

```bash
/sparc-prd                # Start PRD creation
/sparc-prd [feature]      # Create PRD for a specific feature
```

**SPARC Structure:**

- **S**ituation - Current state and context
- **P**roblem - What needs to be solved
- **A**pproach - Proposed solution
- **R**esults - Expected outcomes
- **C**onstraints - Limitations and requirements

### /improve-prompts

Analyze, critique, and improve prompts for LLM agents.

```bash
/improve-prompts          # Start prompt improvement session
/improve-prompts [file]   # Improve a specific prompt file
```

**What It Does:**

- Evaluates prompt structure (5-component check)
- Audits specificity and technique selection
- Identifies anti-patterns
- Rewrites with improvements and explanations

### /ava

Autonomous operator -- identifies friction, ships fixes, keeps work flowing. Supports multi-project delegation across repos.

```bash
/ava                      # Activate in current project
/ava /path/to/project     # Activate for a specific project
```

**Capabilities:**

- Full control surface: features, agents, worktrees, PRs, context files, auto-mode
- Multi-project awareness -- can switch between repos
- Delegation tree: spawns subagents for parallel work
- Autonomous decision-making: creates features, starts agents, merges PRs
- Session continuity: state persists across compaction via hooks

**When to Use:**

- Hands-off autonomous operation ("go work on the backlog")
- Operational leadership across multiple projects
- When things need to get done without step-by-step guidance

### /setuplab

Point at any repo -- scan it, measure the gap against the protoLabs gold standard, initialize automation, and propose alignment work. The entry point for onboarding projects.

```bash
/setuplab https://github.com/org/repo    # Onboard from git URL
/setuplab /path/to/local/project         # Onboard from local path
```

**7-Phase Pipeline:**

1. **Clone/Locate** -- Clone the repo or validate the local path
2. **Research** -- Analyze codebase structure, patterns, and conventions
3. **Gap Analysis** -- Compare against protoLabs gold standard
4. **Alignment Proposal** -- Suggest features to close the gaps
5. **Initialize** -- Create `.automaker/` directory, context files, project spec
6. **Discord Provisioning** -- Set up channels and webhooks (optional)
7. **Report** -- Generate onboarding summary

### /update-plugin

Guided plugin version upgrade. Handles uninstall, reinstall, env migration, and verification.

```bash
/update-plugin           # Start guided upgrade
```

**What It Does:**

- Backs up existing `.env` secrets
- Uninstalls old plugin version (handles `automaker` to `protolabs` rename)
- Reinstalls from current source
- Migrates environment variables
- Verifies MCP server connectivity

> **Note:** This is a temporary command for early tester onboarding. It will be removed once all testers are on v0.15.x+.

## Subagents

The plugin includes 13 specialized agents for complex tasks. Invoke them via the `Task` tool with `subagent_type: "protolabs:<agent-name>"`.

### protolabs:feature-planner

Breaks down complex features into smaller, implementable tasks with proper dependencies.

**Model:** Opus | **When to Use:** Planning a large feature with multiple components

```javascript
Task(subagent_type: "protolabs:feature-planner",
     prompt: "Project: /path/to/project.
              Feature: Add a complete user authentication system with:
              - Login/logout
              - Registration
              - Password reset
              - Email verification
              Context: Using React and Express with PostgreSQL.")
```

### protolabs:agent-reviewer

Reviews completed agent work and provides feedback.

**Model:** Sonnet | **When to Use:** After an agent completes a feature, for code quality assessment

```javascript
Task(subagent_type: "protolabs:agent-reviewer",
     prompt: "Project: /path/to/project.
              Feature ID: abc-123.
              Focus: security, code quality, tests")
```

### protolabs:codebase-analyzer

Analyzes codebase structure, patterns, and suggests feature dependencies.

**Model:** Opus | **When to Use:** Understanding a new codebase, planning optimal execution order

### protolabs:deep-research

Codebase exploration agent for gathering context before planning.

**Model:** Opus | **When to Use:** Deep-diving into a codebase area before implementing a feature

### protolabs:sparc-prd

SPARC PRD creation agent for structured requirements documents.

**Model:** Opus | **When to Use:** Creating comprehensive PRDs with situation/problem/approach/results/constraints

### protolabs:prd-reviewer

PRD validation agent that checks quality and feasibility.

**Model:** Opus | **When to Use:** Reviewing a generated PRD before approval

### protolabs:feature-factory

Creates features from project phases with proper dependencies.

**Model:** Haiku | **When to Use:** Converting project phases into board features

### protolabs:project-scaffold

Creates project directory structure from approved PRD.

**Model:** Haiku | **When to Use:** Scaffolding `.automaker/projects/` structure from a PRD

### protolabs:devops-health-check

Run comprehensive health diagnostics for deployment.

**Model:** Haiku | **When to Use:** Checking system health, diagnosing issues

### protolabs:devops-logs

Analyze container logs for errors, patterns, and issues.

**Model:** Haiku | **When to Use:** Investigating runtime errors or anomalies

### protolabs:devops-backup

Backup and restore Docker volumes.

**Model:** Haiku | **When to Use:** Creating or restoring backups

## Model Assignment Reference

### Command Models

| Command            | Model  | Rationale                    |
| ------------------ | ------ | ---------------------------- |
| `/welcome`         | Sonnet | Adaptive conversational flow |
| `/deep-research`   | Haiku  | Fast exploration             |
| `/board`           | --     | No model (direct tool calls) |
| `/auto-mode`       | --     | No model (direct tool calls) |
| `/orchestrate`     | --     | No model (direct tool calls) |
| `/context`         | --     | No model (direct tool calls) |
| `/ship`            | --     | No model (direct tool calls) |
| `/headsdown`       | --     | No model (direct tool calls) |
| `/improve-prompts` | --     | No model (direct tool calls) |
| `/due-diligence`   | Sonnet | Evidence-based analysis      |
| `/plan-project`    | Sonnet | Complex orchestration        |
| `/sparc-prd`       | Sonnet | Sophisticated analysis       |
| `/ava`             | --     | No model (direct tool calls) |
| `/setuplab`        | Sonnet | Complex multi-phase pipeline |
| `/update-plugin`   | --     | No model (direct tool calls) |

### Agent Models

| Agent                 | Model  | Rationale               |
| --------------------- | ------ | ----------------------- |
| `feature-factory`     | Haiku  | Straightforward parsing |
| `project-scaffold`    | Haiku  | Simple file operations  |
| `devops-health-check` | Haiku  | Quick diagnostics       |
| `devops-logs`         | Haiku  | Log parsing             |
| `devops-backup`       | Haiku  | Simple file operations  |
| `agent-reviewer`      | Sonnet | Code quality judgment   |
| `feature-planner`     | Opus   | Architectural decisions |
| `codebase-analyzer`   | Opus   | Deep pattern analysis   |
| `deep-research`       | Opus   | Thorough exploration    |
| `sparc-prd`           | Opus   | Sophisticated analysis  |
| `prd-reviewer`        | Opus   | PRD validation          |

## Step-by-Step Examples

### Creating a Feature via Claude Code

```
User: Create a feature to add a dark mode toggle

Claude: I'll create that feature for you.

[Calls mcp__protolabs__create_feature with:
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

[Calls mcp__protolabs__set_feature_dependencies with:
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

[Calls mcp__protolabs__start_auto_mode with:
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

[Calls mcp__protolabs__get_agent_output with:
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
  - mcp__protolabs__tool_name
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
  - mcp__protolabs__tool_name
model: sonnet
---
# Agent Instructions

Your agent prompt here...
```

## Related Documentation

- [Plugin Quickstart](./plugin-quickstart.md) -- 5-minute setup guide
- [Plugin Deep Dive](./plugin-deep-dive.md) -- Architecture, hooks, tools, and extension points
- [Claude Plugin Setup](./claude-plugin.md) -- Installation, configuration, Docker deployment
- [MCP Tools Reference](../reference/mcp-tools.md) -- Full MCP tool catalog
- [Context System](/guides/context-files) -- Best practices for context files
