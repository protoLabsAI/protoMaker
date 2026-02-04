---
name: scaffold-project
description: Create project directory structure from an approved PRD.
argument-hint: <project slug>
allowed-tools:
  - Read
  - Write
  - AskUserQuestion
  - mcp__automaker__get_project_spec
  - mcp__automaker__list_features
model: haiku
---

# Scaffold Project Command

Create the project directory structure in `.automaker/projects/`.

## Input

- **projectSlug**: Identifier for the project (e.g., "epic-support")
- **PRD**: The approved SPARC PRD document
- **Milestones**: Breakdown of work into milestones and phases

## Directory Structure

Creates:

```
.automaker/
└── projects/
    └── {project-slug}/
        ├── project.md           # Project overview
        ├── project.json         # Full project data
        ├── prd.md               # SPARC PRD
        ├── research.md          # Research summary (if available)
        └── milestones/
            ├── 01-foundation/
            │   ├── milestone.md
            │   ├── phase-01-types.md
            │   └── phase-02-server.md
            └── 02-features/
                ├── milestone.md
                └── phase-01-ui.md
```

## File Formats

### project.md

```markdown
# Project: [Title]

## Goal

[Goal from PRD]

## Milestones

1. Foundation - Core types and infrastructure
2. Features - User-facing functionality
3. Polish - Testing and documentation
```

### milestone.md

```markdown
# Milestone: [Title]

## Description

[Milestone description]

## Phases

1. Types - Add core type definitions
2. Server - Implement service layer
3. Tests - Add unit tests

## Dependencies

- None (or list dependent milestones)
```

### phase-XX-name.md

```markdown
# Phase: [Title]

## Description

[Detailed description of the work]

## Files to Modify

- path/to/file.ts

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Estimated Complexity

Small / Medium / Large

## Dependencies

- None (or list dependent phases)
```

## Workflow

### Step 1: Validate Input

Check that all required information is provided:

- Project title and goal
- At least one milestone
- Each milestone has at least one phase

### Step 2: Generate Slugs

Create URL-safe slugs for:

- Project: `kebab-case(title)`
- Milestone: `{number}-{kebab-case(title)}`
- Phase: `phase-{number}-{kebab-case(title)}`

### Step 3: Create Directory Structure

Use the projects API or write files directly:

1. Create project directory
2. Create milestones directory
3. For each milestone:
   - Create milestone directory
   - Write milestone.md
   - For each phase:
     - Write phase file

### Step 4: Save Project Data

Write `project.json` with full structured data for later use.

### Step 5: Confirm Creation

```markdown
## Project Scaffolded: [Title]

📁 Created at: .automaker/projects/[slug]/

### Structure

- project.md
- project.json
- prd.md
- milestones/
  - 01-foundation/
    - milestone.md
    - phase-01-types.md
    - phase-02-server.md
  - 02-features/
    - milestone.md
    - phase-01-ui.md

### Next Steps

Run `/create-project-features [slug]` to create board features.
```

## Phase Templates

### Types Phase

```markdown
# Phase: Core Type Definitions

## Description

Create TypeScript types and interfaces for [feature area].

## Files to Modify

- src/types/[area].ts

## Acceptance Criteria

- [ ] Types are exported from index
- [ ] Types compile without errors
- [ ] Types match expected data structure

## Estimated Complexity

Small
```

### Service Phase

```markdown
# Phase: Service Layer

## Description

Implement the [area] service with CRUD operations.

## Files to Modify

- src/services/[area]-service.ts

## Acceptance Criteria

- [ ] All CRUD operations work
- [ ] Proper error handling
- [ ] Logging added

## Estimated Complexity

Medium
```

### UI Phase

```markdown
# Phase: UI Components

## Description

Build React components for [feature area].

## Files to Modify

- src/components/[Area]/index.tsx
- src/components/[Area]/[Component].tsx

## Acceptance Criteria

- [ ] Components render correctly
- [ ] Props are properly typed
- [ ] Responsive design
- [ ] Accessible (keyboard, screen readers)

## Estimated Complexity

Medium
```
