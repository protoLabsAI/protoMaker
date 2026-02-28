---
name: create-project
description: Full project orchestration pipeline - research, PRD, review, scaffold, and create features.
argument-hint: <project name or description>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - Write
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__get_project_spec
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_context_file
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__create_project
  - mcp__plugin_protolabs_studio__get_project
  - mcp__plugin_protolabs_studio__update_project
  - mcp__plugin_protolabs_studio__create_project_features
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__set_feature_dependencies
  - mcp__plugin_protolabs_studio__sync_project_to_linear
  - mcp__plugin_protolabs_studio__archive_project
model: sonnet
---

# Create Project Command

Complete project orchestration pipeline:

1. Deep Research → Understand codebase
2. SPARC PRD → Create requirements document
3. Review → Validate PRD
4. Scaffold → Create project structure
5. Features → Create board features

## Workflow

### Step 1: Initialize

Check Automaker server health:

```
mcp__plugin_protolabs_studio__health_check()
```

Get project path confirmation:

```
header: "Project"
question: "Which project should this be created in?"
```

### Step 2: Research Phase

If the project is complex, spawn the deep research agent:

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

### Step 3: PRD Creation

Based on research, create the SPARC PRD:

Present draft sections for user feedback:

```
header: "PRD Review"
question: "Review the Situation section. Is this accurate?"
options:
  - label: "Looks good"
    description: "Continue to next section"
  - label: "Needs changes"
    description: "I'll provide corrections"
```

### Step 4: Milestone Planning

Break the project into milestones:

```
header: "Milestones"
question: "How should we structure the work?"
options:
  - label: "Suggested structure"
    description: "[Generated milestone breakdown]"
  - label: "Custom structure"
    description: "I'll define the milestones"
```

### Step 5: Phase Definition

For each milestone, define phases:

Each phase should be:

- Completable in ~30-60 minutes by an AI agent
- Independently testable (build + tests must pass)
- Have clear acceptance criteria
- Touch distinct files (no two phases modifying the same file unless sequenced)

Phase sizing guide:

- If a phase is < 50 lines of code, merge it with an adjacent phase
- If a milestone has > 5 phases, consolidate — you've over-decomposed
- Types/interfaces go in the same phase as the code that uses them
- Critical-path fixes (race conditions, blockers) are always Phase 1

### Step 6: Scaffold Project

Create the project using the MCP tool:

```
mcp__plugin_protolabs_studio__create_project({
  projectPath: "/path/to/project",
  title: "Project Title",
  goal: "Project goal from PRD",
  prd: { situation, problem, approach, results, constraints },
  researchSummary: "...",
  milestones: [
    {
      title: "Foundation",
      description: "Core infrastructure",
      phases: [
        {
          title: "Type Definitions",
          description: "Create TypeScript types...",
          filesToModify: ["src/types/..."],
          acceptanceCriteria: ["Types compile", "Exported correctly"],
          complexity: "small"
        }
      ]
    }
  ]
})
```

### Step 7: Create Features

Create features from the project plan:

```
mcp__plugin_protolabs_studio__create_project_features({
  projectPath: "/path/to/project",
  projectSlug: "project-slug",
  createEpics: true,
  setupDependencies: true,
  initialStatus: "backlog"
})
```

### Step 8: Linear Handoff

If Linear integration is enabled for this project, sync milestones and archive planning data:

```ts
// Sync milestones and issues to Linear project
mcp__plugin_protolabs_studio__sync_project_to_linear({
  projectPath: '<path>',
  projectSlug: '<slug>',
  cleanupPlaceholders: true,
});

// Archive planning data (Linear is now the project source of truth)
mcp__plugin_protolabs_studio__archive_project({
  projectPath: '<path>',
  projectSlug: '<slug>',
});
```

Skip this step if Linear is not configured or the user opts out.

### Step 9: Summary

Present the final summary:

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

## Error Handling

### Server Not Running

```
Automaker server is not running.
Start with: npm run dev
```

### Project Already Exists

```
Project "[slug]" already exists.
Options:
1. Use different name
2. Delete existing: `/api/projects/delete`
3. View existing: `/api/projects/get`
```

### Feature Creation Failed

```
Some features failed to create:
- [Error details]

Created features are still available.
Retry failed ones manually or fix issues.
```

## Project Templates

### API Project

Milestones: Types → Services → Routes → Tests → Docs

### UI Project

Milestones: Design → Components → State → Integration → Polish

### Full-Stack Project

Milestones: Foundation → Backend → Frontend → Integration → Deploy

### Refactoring Project

Milestones: Analysis → New Implementation → Migration → Cleanup
