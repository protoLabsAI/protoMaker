---
name: sparc-prd
description: Create a SPARC-style Product Requirements Document for a feature or project.
argument-hint: <feature name or description>
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - Write
  - mcp__plugin_automaker_automaker__get_project_spec
  - mcp__plugin_automaker_automaker__list_context_files
  - mcp__plugin_automaker_automaker__get_context_file
  - mcp__plugin_automaker_automaker__list_features
model: sonnet
---

# SPARC PRD Creator

Create a structured Product Requirements Document using the SPARC methodology.

## SPARC Framework

**S** - Situation: Current state, context, and background
**P** - Problem: Specific issues to solve
**A** - Approach: Proposed solution and implementation strategy
**R** - Results: Expected outcomes and success metrics
**C** - Constraints: Limitations, requirements, and dependencies

## Workflow

### Step 1: Gather Context

1. Check for existing research:
   - If coming from `/deep-research`, use the research summary
   - Otherwise, gather basic context from the codebase

2. Get project specification:

   ```
   mcp__plugin_automaker_automaker__get_project_spec({ projectPath })
   ```

3. Review related features:
   ```
   mcp__plugin_automaker_automaker__list_features({ projectPath })
   ```

### Step 2: Clarify Requirements

Ask focused questions to fill in PRD sections:

```
header: "Feature Scope"
question: "What is the primary goal of this feature?"
options:
  - label: "Add new functionality"
    description: "Implement something that doesn't exist"
  - label: "Improve existing feature"
    description: "Enhance current behavior"
  - label: "Fix problems"
    description: "Address bugs or technical debt"
  - label: "Infrastructure"
    description: "Non-user-facing improvements"
```

For complex features, ask about:

- Target users/consumers
- Integration points
- Performance requirements
- Security considerations

### Step 3: Draft the PRD

Structure the PRD using SPARC sections:

```markdown
# PRD: [Feature Name]

## Situation

Describe the current state:

- What exists today
- Recent changes or trends
- Relevant technical context
- User feedback or requests

## Problem

Define the specific issues:

- Pain points being addressed
- Technical challenges
- Business impact
- Why this matters now

## Approach

Propose the solution:

- High-level architecture
- Key components to build/modify
- Implementation phases/milestones
- Technology choices and rationale

## Results

Expected outcomes:

- Success metrics (measurable)
- User experience improvements
- Performance targets
- Business value

## Constraints

Limitations and requirements:

- Technical constraints
- Timeline constraints
- Resource constraints
- Dependencies on other work
- Non-goals (what we're NOT doing)
```

### Step 4: Define Milestones

Break the approach into milestones with phases:

```markdown
## Milestones

### Milestone 1: Foundation

**Goal**: Core infrastructure
**Phases**:

1. Types and data models
2. Service layer
3. Basic tests

### Milestone 2: Features

**Goal**: User-facing functionality
**Phases**:

1. API endpoints
2. UI components
3. Integration tests

### Milestone 3: Polish

**Goal**: Production readiness
**Phases**:

1. Error handling
2. Documentation
3. Performance optimization
```

### Step 5: Save the PRD

If the user wants to save the PRD for later scaffolding:

```
Write the PRD to: .automaker/projects/[slug]/prd.md
```

### Step 6: Offer Next Steps

```
PRD created! Next steps:
1. Review and refine the PRD
2. `/scaffold-project [slug]` to create project structure
3. `/plan-project [slug]` to create features and launch the project
```

## PRD Quality Checklist

Before presenting the PRD, verify:

- [ ] Situation clearly describes current state
- [ ] Problem is specific and actionable
- [ ] Approach is technically sound
- [ ] Results are measurable
- [ ] Constraints are realistic
- [ ] Milestones are achievable
- [ ] Phases are properly sized for AI agents

## Templates by Feature Type

### API Feature PRD

Focus on: endpoints, data models, validation, error handling

### UI Feature PRD

Focus on: components, user flows, state management, accessibility

### Infrastructure PRD

Focus on: architecture, performance, reliability, observability

### Refactoring PRD

Focus on: current debt, migration path, backwards compatibility
