---
name: plan-project
description: Full project lifecycle — research, PRD, milestones, feature creation, and launch.
category: planning
argument-hint: <project idea or title>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - Write
  - AskUserQuestion
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__initiate_project
  - mcp__plugin_protolabs_studio__generate_project_prd
  - mcp__plugin_protolabs_studio__approve_project_prd
  - mcp__plugin_protolabs_studio__launch_project
  - mcp__plugin_protolabs_studio__get_lifecycle_status
  - mcp__plugin_protolabs_studio__create_project
  - mcp__plugin_protolabs_studio__get_project
  - mcp__plugin_protolabs_studio__update_project
  - mcp__plugin_protolabs_studio__create_project_features
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__get_project_spec
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_context_file
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__set_feature_dependencies
  - mcp__plugin_protolabs_studio__archive_project
  - mcp__plugin_protolabs_studio__save_project_milestones
model: sonnet
---

# Plan Project

Single unified flow from idea to running agents. This replaces both the old `/create-project` and `/plan-project` commands.

## Flow

```
Health Check → Resume Check → Research → PRD + Create → [GATE] → Features → [GATE] → Launch
```

### Step 1: Health Check

```
mcp__plugin_protolabs_studio__health_check()
```

Confirm projectPath with the user if not obvious from context.

### Step 2: Resume Check

If a projectSlug is provided or can be inferred, check existing status:

```
mcp__plugin_protolabs_studio__get_lifecycle_status({ projectPath, projectSlug })
```

Based on the phase, skip ahead:

| Phase           | Skip To          |
| --------------- | ---------------- |
| `unknown`       | Step 3 (start)   |
| `idea`          | Step 5 (PRD)     |
| `idea-approved` | Step 7 (approve) |
| `prd-approved`  | Step 9 (launch)  |
| `started`       | Show status      |
| `completed`     | Show summary     |

### Step 3: Research Phase

For complex projects or unfamiliar codebases, spawn a research agent:

```
Task(subagent_type: "Explore",
     prompt: "Research the codebase for implementing: [project description]

              Focus on:
              1. Related existing code and patterns
              2. Integration points and dependencies
              3. Potential challenges

              Project path: [projectPath]")
```

For simple or well-understood projects, skip to Step 4.

### Step 4: PRD + Milestones + Create Project

Create a SPARC PRD with these sections:

- **Situation**: Current state and context
- **Problem**: What needs to be solved
- **Approach**: How we'll solve it
- **Results**: Expected outcomes and success metrics
- **Constraints**: Limitations and boundaries

Create the project directly with full PRD and milestones in one call:

```
mcp__plugin_protolabs_studio__create_project({
  projectPath, title, goal,
  prd: { situation, problem, approach, results, constraints },
  milestones: [...]
})
```

Note: `create_project` handles dedup — if a project with the same slug exists but has no milestones (stub from `initiate_project`), it overwrites it. If a fully scaffolded project exists, it returns 409.

### Step 5: [GATE] User Approves PRD

Present the SPARC sections. Ask:

- "Approve PRD and proceed to feature creation?"
- Options: Approve | Request changes | Cancel

If changes requested: update and re-present.

### Step 6: Milestone + Phase Planning

Break work into milestones. Each phase should be:

- Completable in ~30-60 minutes by an AI agent
- Independently testable (build + tests must pass)
- Have clear acceptance criteria
- Touch distinct files (no two phases modifying the same file unless sequenced)

**Phase sizing guide:**

- < 50 lines of code → merge with adjacent phase
- \> 5 phases per milestone → consolidate
- Types/interfaces go in the same phase as consuming code
- Critical-path fixes are always Phase 1

**Common project shapes:**

| Type       | Milestones                                          |
| ---------- | --------------------------------------------------- |
| API        | Types → Services → Routes → Tests → Docs            |
| UI         | Design → Components → State → Integration → Polish  |
| Full-Stack | Foundation → Backend → Frontend → Integration       |
| Refactor   | Analysis → New Implementation → Migration → Cleanup |

### Step 7: Create Features

```
mcp__plugin_protolabs_studio__approve_project_prd({
  projectPath, projectSlug,
  createEpics: true,
  setupDependencies: true
})
```

Present results: features created, epics, dependency chain.

### Step 8: [GATE] Validate + Launch

Ask: "Features created. Review and confirm ready to launch?"

Options: Launch now | Review first | Cancel

If "Review first": show `list_features` and `get_board_summary`.

```
mcp__plugin_protolabs_studio__launch_project({
  projectPath, projectSlug
})
```

### Step 9: Summary

```markdown
## Project: [Title]

### Milestones

| #   | Milestone  | Phases | Epic ID  |
| --- | ---------- | ------ | -------- |
| 1   | Foundation | 3      | epic-123 |
| 2   | Features   | 5      | epic-456 |

### Board

- X features in backlog
- Dependencies configured
- Auto-mode: [started/ready]

### Next Steps

1. Review features on the board
2. `/auto-mode start` if not already running
```

## Error Handling

### Server Not Running

```
protoLabs Studio server is not running.
Start with: npm run dev
```

### Project Already Exists

Show existing project. Options: use different name, delete existing, or view existing.

### Feature Creation Failed

Report which features failed. Created features remain available. Retry failed ones or fix issues.
