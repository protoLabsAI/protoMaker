---
name: auto-mode
description: Start or stop protoLabs Studio auto-mode for autonomous feature processing. Agents automatically pick up backlog features respecting dependencies.
category: operations
argument-hint: (start|stop|status) [project-path]
allowed-tools:
  - AskUserQuestion
  # Auto-mode Control
  - mcp__plugin_protolabs_studio__start_auto_mode
  - mcp__plugin_protolabs_studio__stop_auto_mode
  - mcp__plugin_protolabs_studio__get_auto_mode_status
  # Supporting tools
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__list_running_agents
  - mcp__plugin_protolabs_studio__get_execution_order
  - mcp__plugin_protolabs_studio__health_check
---

# protoLabs Studio Auto-Mode Controller

You manage protoLabs Studio auto-mode - the autonomous feature processing system that runs AI agents on backlog features.

## What is Auto-Mode?

Auto-mode continuously processes features from the backlog:

1. Picks up features that have no unmet dependencies
2. Starts an AI agent to implement each feature
3. Moves completed features to review
4. Picks up the next available feature
5. Repeats until backlog is empty or stopped

## Commands

### Start Auto-Mode

When user says "start", "begin", "run auto-mode":

1. Check server health first
2. Get current board summary to show what will be processed
3. Show execution order based on dependencies
4. Confirm with user before starting

```
header: "Auto-Mode Configuration"
question: "How many features should run concurrently?"
options:
  - label: "1 (Sequential)"
    description: "Safest - one agent at a time"
  - label: "2 (Parallel)"
    description: "Faster - two agents working simultaneously"
  - label: "3+ (High Parallelism)"
    description: "Maximum speed - requires more resources"
```

Then start:

```
mcp__plugin_protolabs_studio__start_auto_mode({
  projectPath: "<path>",
  maxConcurrency: <chosen-value>
})
```

### Stop Auto-Mode

When user says "stop", "halt", "pause auto-mode":

1. Check if auto-mode is running
2. Stop it gracefully
3. Show what was in progress (agents will complete their current feature)

```
mcp__plugin_protolabs_studio__stop_auto_mode({ projectPath: "<path>" })
```

### Check Status

When user says "status", "check", "is auto-mode running":

```
mcp__plugin_protolabs_studio__get_auto_mode_status({ projectPath: "<path>" })
```

Display:

```
## Auto-Mode Status

**State**: Running / Stopped
**Concurrency**: X agents
**Features Processed**: Y
**Currently Running**:
- [Feature 1] - Agent active
- [Feature 2] - Agent active

**Queue**:
1. [Next feature] - ready
2. [Blocked feature] - waiting on [dependency]
```

## Workflow Example

```
User: "start auto-mode"

You:
1. mcp__plugin_protolabs_studio__health_check()
2. mcp__plugin_protolabs_studio__get_board_summary({ projectPath })
3. mcp__plugin_protolabs_studio__get_execution_order({ projectPath })
4. Ask about concurrency
5. mcp__plugin_protolabs_studio__start_auto_mode({ projectPath, maxConcurrency })
6. Confirm started and show first features being processed
```

## Safety Notes

- Auto-mode will NOT process features with unmet dependencies
- Features in "review" or "done" are skipped
- Stopping auto-mode lets current agents finish gracefully
- If an agent fails, that feature is left in "in-progress" for manual review
