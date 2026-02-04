---
name: create-project-features
description: Create features on the Kanban board from an existing project plan.
argument-hint: <project slug>
allowed-tools:
  - Read
  - AskUserQuestion
  - mcp__automaker__list_features
  - mcp__automaker__create_feature
  - mcp__automaker__set_feature_dependencies
  - mcp__automaker__health_check
model: haiku
---

# Create Project Features Command

Convert a scaffolded project into features on the Kanban board.

## Input

- **projectPath**: Path to the project root
- **projectSlug**: The project identifier (directory name in .automaker/projects/)

## What It Does

1. Reads the project structure from `.automaker/projects/[slug]/`
2. Creates an epic feature for each milestone (optional)
3. Creates a feature for each phase
4. Sets up dependencies between features

## Feature Creation

### Milestones → Epics

Each milestone becomes an epic feature:

- Title: `[Epic] {Milestone Title}`
- Status: backlog
- isEpic: true
- epicColor: assigned from palette

### Phases → Features

Each phase becomes a regular feature:

- Title: Phase title
- Description: From phase file
- Category: Milestone title
- epicId: Links to parent epic
- branchName: Auto-generated from title

## Dependency Mapping

Dependencies are translated:

- Milestone dependencies → Epic depends on epic
- Phase dependencies → Feature depends on feature
- Sequential phases → Implicit dependency chain

## Workflow

### Step 1: Verify Server

```
mcp__automaker__health_check()
```

### Step 2: Load Project

Read `project.json` from `.automaker/projects/[slug]/`

### Step 3: Confirm Options

```
header: "Feature Options"
question: "How should features be created?"
options:
  - label: "With epics (Recommended)"
    description: "Create epic features for each milestone"
  - label: "Flat"
    description: "Create only phase features"
```

```
header: "Dependencies"
question: "Set up feature dependencies?"
options:
  - label: "Yes (Recommended)"
    description: "Features will respect execution order"
  - label: "No"
    description: "All features independent"
```

### Step 4: Create Features

For each milestone:

1. Create epic feature (if requested)
2. For each phase:
   - Create feature with description
   - Link to epic
   - Set branchName

### Step 5: Set Dependencies

After all features created:

1. Link epic dependencies
2. Link phase dependencies
3. Create implicit chains for sequential phases

### Step 6: Update Project

Update `project.json` with:

- Feature IDs linked to phases
- Epic IDs linked to milestones
- Status → 'active'

### Step 7: Summary

```markdown
## Features Created

### Epics

| Milestone  | Epic ID  | Phases |
| ---------- | -------- | ------ |
| Foundation | epic-abc | 3      |
| Features   | epic-def | 4      |

### Features

| Phase  | Feature ID | Dependencies |
| ------ | ---------- | ------------ |
| Types  | feat-123   | -            |
| Server | feat-456   | feat-123     |
| UI     | feat-789   | feat-456     |

### Statistics

- Total features: 7 (2 epics, 5 phases)
- Dependency links: 4
- Ready to start: 2

### Execution Order

1. [Types] → no dependencies
2. [Server] → depends on Types
3. [UI] → depends on Server

### Next Steps

- View board: `/board`
- Start auto-mode: `/auto-mode start`
- Start first feature: `/board start [feat-123]`
```

## Error Handling

### Project Not Found

```
Project "[slug]" not found.
Available projects: [list]
```

### Duplicate Features

```
Feature "[title]" already exists (ID: xxx).
Skipping to avoid duplicates.
```

### Dependency Issues

```
Could not resolve dependency "[dep]".
Feature created without this dependency.
```

## Advanced Options

### Starting Status

By default, features are created in backlog.
Option to create first phase as in-progress to immediately start work.

### Selective Creation

Option to create features for only specific milestones:

```
Create features for:
- [ ] Milestone 1: Foundation
- [x] Milestone 2: Features
- [ ] Milestone 3: Polish
```
