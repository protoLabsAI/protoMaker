---
name: plan-project
description: Full project lifecycle — research, PRD, milestones, feature creation, and launch. Works with Linear as source of truth or standalone.
argument-hint: <project idea or title>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__initiate_project
  - mcp__plugin_protolabs_studio__generate_project_prd
  - mcp__plugin_protolabs_studio__approve_project_prd
  - mcp__plugin_protolabs_studio__launch_project
  - mcp__plugin_protolabs_studio__get_lifecycle_status
  - mcp__plugin_protolabs_studio__collect_related_issues
  - mcp__plugin_protolabs_studio__create_project
  - mcp__plugin_protolabs_studio__get_project
  - mcp__plugin_protolabs_studio__update_project
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__get_project_spec
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_context_file
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__set_feature_dependencies
  - mcp__plugin_protolabs_studio__sync_project_to_linear
  - mcp__plugin_protolabs_studio__archive_project
model: sonnet
---

# Plan Project Command

Full project lifecycle from idea to launch:

1. Health Check → Verify server
2. Resume Check → Pick up where we left off
3. Research → Understand codebase (for complex projects)
4. Dedup → Avoid duplicate projects
5. PRD → Create SPARC requirements document
6. Milestones → Break into phases
7. Features → Create board features
8. Launch → Start auto-mode

## Flow

### Step 1: Health Check

Run `health_check` to verify Automaker is running. Check if Linear integration is configured — it's preferred but not required.

### Step 2: Check Existing Status

If a projectSlug is provided or can be inferred, run `get_lifecycle_status` first.
This allows resuming mid-stream (e.g., a project already has PRD + milestones).

Based on the status, skip to the appropriate step:

- `unknown` → Start from Step 3
- `idea` → Skip to Step 5 (generate PRD)
- `idea-approved` → Skip to Step 7 (approve PRD)
- `prd-approved` → Skip to Step 9 (launch)
- `started` → Already running, show status
- `completed` → Done, show summary

### Step 3: Research Phase

For complex projects, spawn a research agent to understand the codebase:

```
Task(subagent_type: "Explore",
     prompt: "Research the codebase for implementing: [project description]

              Focus on:
              1. Related existing code
              2. Patterns and conventions
              3. Integration points
              4. Potential challenges

              Project path: [projectPath]",
     model: "haiku")
```

For simple or well-understood projects, skip to Step 4.

### Step 4: Dedup Check

If Linear is configured, run `initiate_project` with the title.

If `hasDuplicates: true`:

- Show the duplicate projects found
- Ask the user: "Similar projects found. Proceed with new project, merge into existing, or cancel?"
- If cancel: stop
- If merge: use `collect_related_issues` to move issues

If Linear is NOT configured, skip dedup and proceed directly to PRD creation.

### Step 5: Create Idea + Generate PRD

**With Linear:** The project is created in Linear. Present the Linear URL to the user.

**Without Linear:** Proceed directly to PRD creation using `create_project`.

Run `generate_project_prd` to check for existing PRD.

If no PRD exists, create one following SPARC format:

- **Situation**: Current state and context
- **Problem**: What needs to be solved
- **Approach**: How we'll solve it
- **Results**: Expected outcomes and success metrics
- **Constraints**: Limitations and boundaries

If PRD exists, present the SPARC sections to the user.

### Step 6: [GATE] User Approves PRD

Ask the user:

- "Approve PRD and proceed to milestone creation?"
- Options: "Approve", "Request changes", "Cancel"

If changes requested: tell user to update the project PRD and re-run this command.

### Step 7: Milestone + Phase Planning

Break the project into milestones and phases. Each phase should be:

- Completable in ~30-60 minutes by an AI agent
- Independently testable (build + tests must pass)
- Have clear acceptance criteria
- Touch distinct files (no two phases modifying the same file unless sequenced)

**Phase sizing guide:**

- If a phase is < 50 lines of code, merge it with an adjacent phase
- If a milestone has > 5 phases, consolidate — you've over-decomposed
- Types/interfaces go in the same phase as the code that uses them
- Critical-path fixes (race conditions, blockers) are always Phase 1

**Common project shapes:**

| Type       | Milestones                                          |
| ---------- | --------------------------------------------------- |
| API        | Types → Services → Routes → Tests → Docs            |
| UI         | Design → Components → State → Integration → Polish  |
| Full-Stack | Foundation → Backend → Frontend → Integration       |
| Refactor   | Analysis → New Implementation → Migration → Cleanup |

### Step 8: Create Features

Run `approve_project_prd` with the project slug (or create features directly with `create_feature` + `set_feature_dependencies`).

- This creates board features from milestones
- Sets up dependencies between features
- Creates epic features for milestone grouping

Present the results:

- Number of features created
- Number of epics created
- Dependency chain

### Step 9: [GATE] Validate + Launch

Ask the user:

- "Features created on the board. Review them and confirm ready to launch?"
- Options: "Launch now", "Review first", "Cancel"

If "Review first": run `list_features` and `get_board_summary` to show current state.

**With Linear:** Run `launch_project` with the project slug. Optionally sync milestones with `sync_project_to_linear` and archive planning data with `archive_project`.

**Without Linear:** Start auto-mode directly or let the user start it manually.

### Step 10: Summary

Show a summary dashboard:

```markdown
## Project Created: [Title]

### Milestones

| #   | Milestone  | Phases | Epic ID  |
| --- | ---------- | ------ | -------- |
| 1   | Foundation | 3      | epic-123 |
| 2   | Features   | 5      | epic-456 |

### Features Created

- X features in backlog
- Dependencies configured
- Ready for auto-mode

### Next Steps

1. Review features in Automaker UI
2. Start auto-mode: `/auto-mode start`
3. Or manually start first feature
```

## Important Notes

- Each gate uses `AskUserQuestion` with clear options
- Can resume at any gate by checking `get_lifecycle_status`
- The `projectPath` should be the root of the target repository
- Linear integration is preferred but not required — works standalone
