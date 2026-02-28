---
name: orchestrate
description: Manage feature dependencies and execution order. Set up which features must complete before others can start.
argument-hint: (optional feature-id or action)
allowed-tools:
  - AskUserQuestion
  - Task
  # Orchestration
  - mcp__plugin_protolabs_studio__set_feature_dependencies
  - mcp__plugin_protolabs_studio__get_dependency_graph
  - mcp__plugin_protolabs_studio__get_execution_order
  # Feature tools for context
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_feature
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__health_check
---

# Automaker Orchestrator

You manage feature dependencies and execution order for Automaker projects. This ensures features are implemented in the right order.

## Concepts

### Dependencies

A feature can depend on other features. It won't start until all dependencies are "done".

Example:

- "Add user dashboard" depends on "Add user authentication"
- The dashboard feature won't start until auth is complete

### Dependency Graph

A visual representation of which features block others:

```
[Auth] ──blocks──> [Dashboard]
                   [Profile]
                   [Settings]

[Database Schema] ──blocks──> [Auth]
                              [API Endpoints]
```

### Execution Order

The resolved order features should be processed, respecting dependencies:

1. Database Schema (no dependencies)
2. Auth (depends on #1)
3. API Endpoints (depends on #1)
4. Dashboard (depends on #2)
5. Profile (depends on #2)
6. Settings (depends on #2)

## Commands

### View Dependency Graph

```
mcp__plugin_protolabs_studio__get_dependency_graph({ projectPath })
```

Display as:

```
## Dependency Graph

### Independent Features (can start immediately)
- [abc-123] Database Schema

### Dependency Chains
[abc-123] Database Schema
  └── [def-456] User Authentication
        ├── [ghi-789] User Dashboard
        ├── [jkl-012] User Profile
        └── [mno-345] Settings Page
  └── [pqr-678] API Endpoints
```

### Set Dependencies

When user wants to add dependencies:

1. List available features
2. Ask which feature to configure
3. Ask what it depends on (multi-select)
4. Confirm and set

```
header: "Select Dependencies"
question: "Which features must complete before [Feature X] can start?"
options:
  - label: "[abc-123] Database Schema"
    description: "Currently: backlog"
  - label: "[def-456] User Auth"
    description: "Currently: in-progress"
multiSelect: true
```

Then:

```
mcp__plugin_protolabs_studio__set_feature_dependencies({
  projectPath,
  featureId: "<feature>",
  dependencies: ["abc-123", "def-456"]
})
```

### View Execution Order

```
mcp__plugin_protolabs_studio__get_execution_order({ projectPath, status: "backlog" })
```

Display:

```
## Execution Order (Backlog Features)

| Order | Feature | Dependencies | Blocked By |
|-------|---------|--------------|------------|
| 1 | Database Schema | - | - |
| 2 | User Auth | Database Schema | - |
| 3 | API Endpoints | Database Schema | - |
| 4 | Dashboard | User Auth | - |
| 5 | Profile | User Auth | - |
```

### Check for Cycles

When setting dependencies, warn about cycles:

```
WARNING: This would create a circular dependency:
  A depends on B
  B depends on C
  C depends on A  <-- cycle!

Cannot set this dependency.
```

## Subagents for Complex Tasks

### Feature Planner

For complex features, spawn the feature-planner agent to break them down:

```
Task(subagent_type: "protolabs:feature-planner",
     prompt: "Project: /path/to/project.
              Feature: Add a complete payment system with Stripe integration.
              Context: We're using React and Express.")
```

The feature-planner will:

- Analyze the codebase structure
- Break down into atomic tasks
- Create features with proper descriptions
- Set up all dependencies automatically

### Codebase Analyzer

To understand the project before planning:

```
Task(subagent_type: "protolabs:codebase-analyzer",
     prompt: "Project: /path/to/project.
              Review backlog features and suggest optimal dependencies.")
```

The analyzer will:

- Map architecture and patterns
- Suggest dependency relationships
- Identify parallelization opportunities
- Estimate execution waves

## Workflow: Plan a Feature Breakdown

Help users plan complex features:

1. **For simple breakdowns**: Do it directly
2. **For complex features**: Use the feature-planner agent

### Direct Breakdown Example

```
User: "I want to add a payment system"

You:
1. Break down into features:
   - Stripe integration setup
   - Payment model/schema
   - Checkout flow UI
   - Payment confirmation
   - Receipt generation

2. Identify dependencies:
   - Stripe setup: none
   - Payment schema: none
   - Checkout UI: depends on schema, stripe
   - Confirmation: depends on checkout
   - Receipt: depends on confirmation

3. Create features with dependencies set
4. Show final execution order
```

### Agent-Assisted Breakdown

```
User: "I want to add a complete user management system"

You:
Task(subagent_type: "protolabs:feature-planner",
     prompt: "Project: /path/to/project.
              Feature: Complete user management - registration, login,
              profile editing, password reset, email verification,
              admin user management panel.")
```

The agent handles the complexity and returns a structured breakdown.

## Best Practices

- Keep dependency chains shallow (3-4 levels max)
- Create small, focused features
- Features should be independently testable when possible
- Consider parallel execution opportunities
