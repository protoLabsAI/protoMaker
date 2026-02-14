---
name: plan-project
description: Full project lifecycle with Linear as source of truth. From idea through PRD, milestones, feature creation, and launch.
argument-hint: <project idea or title>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - mcp__plugin_automaker_automaker__health_check
  - mcp__plugin_automaker_automaker__initiate_project
  - mcp__plugin_automaker_automaker__generate_project_prd
  - mcp__plugin_automaker_automaker__approve_project_prd
  - mcp__plugin_automaker_automaker__launch_project
  - mcp__plugin_automaker_automaker__get_lifecycle_status
  - mcp__plugin_automaker_automaker__collect_related_issues
  - mcp__plugin_automaker_automaker__create_project
  - mcp__plugin_automaker_automaker__get_project
  - mcp__plugin_automaker_automaker__update_project
  - mcp__plugin_automaker_automaker__list_features
  - mcp__plugin_automaker_automaker__get_board_summary
model: sonnet
---

# Plan Project Command

Full project lifecycle with Linear as the source of truth.

## Flow

### Step 1: Health Check

Run `health_check` to verify Automaker is running and Linear integration is configured.

### Step 2: Check Existing Status

If a projectSlug is provided or can be inferred, run `get_lifecycle_status` first.
This allows resuming mid-stream (e.g., CopilotKit already has PRD + milestones).

Based on the status, skip to the appropriate step:

- `unknown` → Start from Step 3
- `idea` → Skip to Step 5 (generate PRD)
- `idea-approved` → Skip to Step 7 (approve PRD)
- `prd-approved` → Skip to Step 9 (launch)
- `started` → Already running, show status
- `completed` → Done, show summary

### Step 3: Dedup Check

Run `initiate_project` with the title.

If `hasDuplicates: true`:

- Show the duplicate projects found
- Ask the user: "Similar projects found. Proceed with new project, merge into existing, or cancel?"
- If cancel: stop
- If merge: use `collect_related_issues` to move issues

### Step 4: Create Idea

If no duplicates (or user chose to proceed), the project is created in Linear.

- Present the Linear URL to the user
- Ask: "Review the idea in Linear and expand it if needed. Ready to continue?"

### Step 5: Generate PRD

Run `generate_project_prd` to check for existing PRD.

If no PRD exists:

- Tell the user to create the project with a PRD using `create_project`, or manually add one
- The PRD should follow SPARC format: Situation, Problem, Approach, Results, Constraints

If PRD exists:

- Present the SPARC sections to the user
- Show review verdict if available

### Step 6: [GATE] User Approves PRD

Ask the user:

- "Approve PRD and proceed to milestone creation?"
- Options: "Approve", "Request changes", "Cancel"

If changes requested: tell user to update the project PRD and re-run this command.

### Step 7: Create Milestones + Features

Run `approve_project_prd` with the project slug.

- This creates board features from milestones
- Syncs milestones to Linear

Present the results:

- Number of features created
- Number of epics created
- Linear milestones synced

### Step 8: [GATE] Validate Milestones

Ask the user:

- "Features created on the board. Review them and confirm ready to launch?"
- Options: "Launch now", "Review first", "Cancel"

If "Review first": run `list_features` and `get_board_summary` to show current state.

### Step 9: Launch

Run `launch_project` with the project slug.

Present:

- Auto-mode started status
- Number of features in backlog
- Linear project URL

### Step 10: Summary

Show a summary dashboard:

- Linear project URL
- Number of features created
- Auto-mode status
- Next steps for monitoring

## Important Notes

- Each gate uses `AskUserQuestion` with clear options
- Can resume at any gate by checking `get_lifecycle_status`
- The `projectPath` should be the root of the target repository
- Linear integration must be configured (teamId in project settings)
