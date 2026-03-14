# Project Orchestration

protoLabs Studio supports hierarchical project planning with epics, milestones, and phases. This system enables breaking down large initiatives into manageable features while maintaining clear dependencies and structure.

## Planning Workflow

The orchestration system follows this flow:

```
Deep Research → SPARC PRD → Review → Approval → Scaffold → Features
```

**Stages:**

1. **Deep Research** - Gather requirements, analyze feasibility
2. **SPARC PRD** - Document using SPARC framework (Situation, Problem, Approach, Results, Constraints)
3. **Review** - Stakeholder review and feedback
4. **Approval** - Sign-off to proceed
5. **Scaffold** - Create project structure and files
6. **Features** - Convert phases to actionable board features

## Project Structure

Projects are stored in `.automaker/projects/{project-slug}/`:

```
.automaker/projects/my-feature/
├── project.md           # Human-readable overview
├── project.json         # Full project data (machine-readable)
├── prd.md              # SPARC PRD document
└── milestones/
    └── foundation/
        ├── milestone.md
        ├── phase-1-add-types.md
        └── phase-2-add-routes.md
```

### File Contents

**project.md** - Overview with goals, scope, and status

**project.json** - Complete project data:

```json
{
  "slug": "my-feature",
  "title": "My Feature",
  "goal": "Implement X functionality",
  "status": "active",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-20T15:30:00Z",
  "prd": {
    "situation": "...",
    "problem": "...",
    "approach": "...",
    "results": "...",
    "constraints": ["..."]
  },
  "milestones": [...]
}
```

**prd.md** - SPARC-formatted Product Requirements Document

**Milestone files** - Detailed phase descriptions with acceptance criteria

## Project Types

### Project Status Lifecycle

```typescript
type ProjectStatus =
  | 'researching' // Gathering requirements
  | 'drafting' // Writing PRD
  | 'reviewing' // Under stakeholder review
  | 'approved' // Ready to scaffold
  | 'scaffolded' // Files created
  | 'active' // Features in progress
  | 'completed'; // All features merged
```

### SPARC PRD Format

```typescript
interface SPARCPrd {
  situation: string; // Current state and context
  problem: string; // Issue to solve
  approach: string; // Solution strategy
  results: string; // Expected outcomes
  constraints: string[]; // Limitations and requirements
}
```

### Milestones and Phases

```typescript
interface Milestone {
  title: string;
  description: string;
  phases: Phase[];
}

interface Phase {
  title: string;
  description: string;
  filesToModify?: string[];
  acceptanceCriteria: string[];
  complexity: 'small' | 'medium' | 'large';
}
```

## Creating Projects

### Via MCP Tool

```typescript
mcp__protolabs__create_project({
  projectPath: '/path/to/project',
  title: 'User Authentication System',
  goal: 'Implement secure JWT-based authentication',
  prd: {
    situation: 'Current system has no authentication...',
    problem: 'Users cannot securely log in...',
    approach: 'Implement JWT tokens with refresh flow...',
    results: 'Secure, scalable auth system',
    constraints: ['Must support OAuth providers', 'Token expiry: 1 hour access, 7 days refresh'],
  },
  milestones: [
    {
      title: 'Foundation',
      description: 'Core auth infrastructure',
      phases: [
        {
          title: 'Add Auth Types',
          description: 'TypeScript types for tokens, users, sessions',
          filesToModify: ['libs/types/src/auth.ts'],
          acceptanceCriteria: ['Types compile', 'Exported from package index'],
          complexity: 'small',
        },
        {
          title: 'JWT Service',
          description: 'Token generation and validation',
          filesToModify: ['apps/server/src/services/jwt-service.ts'],
          acceptanceCriteria: [
            'Generate access tokens',
            'Generate refresh tokens',
            'Validate tokens',
            'Handle expiry',
          ],
          complexity: 'medium',
        },
      ],
    },
    {
      title: 'User Interface',
      description: 'Login and registration UI',
      phases: [
        {
          title: 'Login Form',
          description: 'React login component',
          filesToModify: ['apps/ui/src/components/LoginForm.tsx'],
          acceptanceCriteria: ['Email + password fields', 'Form validation', 'Error display'],
          complexity: 'medium',
        },
      ],
    },
  ],
});
```

### Via REST API

```bash
curl -X POST http://localhost:3008/api/projects/create \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "title": "User Authentication System",
    "goal": "Implement secure JWT-based authentication",
    "prd": {...},
    "milestones": [...]
  }'
```

## Converting to Features

### With Epic Support

Convert project phases to board features with milestones as epics:

```typescript
mcp__protolabs__create_project_features({
  projectPath: '/path/to/project',
  projectSlug: 'user-authentication-system',
  createEpics: true, // Create epic for each milestone
  setupDependencies: true, // Auto-configure phase order
});
```

**Result:**

```
Board Features:
├── Epic: Foundation (epic/foundation)
│   ├── Feature: Add Auth Types
│   └── Feature: JWT Service
└── Epic: User Interface (epic/user-interface)
    └── Feature: Login Form (depends on: Epic: Foundation)
```

### Without Epics

Convert phases directly to features without epic grouping:

```typescript
mcp__protolabs__create_project_features({
  projectPath: '/path/to/project',
  projectSlug: 'user-authentication-system',
  createEpics: false, // No epics
  setupDependencies: true,
});
```

**Result:**

```
Board Features:
├── Feature: Add Auth Types
├── Feature: JWT Service (depends on: Add Auth Types)
└── Feature: Login Form (depends on: JWT Service)
```

## Epic System

### What are Epics?

Epics are container features that group related work. They enable:

- **Hierarchical organization** - Milestones → Epics → Features
- **Incremental PRs** - Features merge into epic branch, not main
- **Dependency tracking** - Downstream work waits for epic completion
- **Clean main branch** - Only merge epic PR after all features complete

### Epic Feature Structure

```typescript
interface Feature {
  id: string;
  title: string;
  description: string;

  // Epic fields
  isEpic?: boolean; // True for epic features
  epicId?: string; // Parent epic ID (for child features)
  epicColor?: string; // Badge color (hex)
  isFoundation?: boolean; // Downstream deps wait for merge (not just review)
}
```

### Creating Epics Manually

```typescript
// 1. Create epic feature
mcp__protolabs__create_feature({
  projectPath: '/path/to/project',
  title: 'Foundation Infrastructure',
  description: 'Core types, services, and utilities',
  isEpic: true,
  epicColor: '#3b82f6', // Blue badge
  isFoundation: true, // Blockers wait for merge
});

// 2. Create child features
mcp__protolabs__create_feature({
  projectPath: '/path/to/project',
  title: 'Add Auth Types',
  description: 'TypeScript definitions for auth',
  epicId: 'feature-123', // Parent epic ID
});
```

## Epic Git Workflow

### Branching Strategy

```
main
  ↑
epic/foundation ─────────── Epic PR (targets main)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

**Automatic behavior:**

- Feature PRs target their epic's branch (not main)
- Epic PRs target main
- Features without an epic target main directly

### Merge Order

1. Implement features in parallel
2. Create feature PRs targeting epic branch
3. Merge all feature PRs into epic branch
4. Once epic complete, create epic PR to main
5. Merge epic PR to main

### Example Workflow

```bash
# 1. Epic branch auto-created when first feature starts
git checkout epic/foundation

# 2. Feature branches created from epic
git checkout -b feature/add-auth-types epic/foundation

# 3. Feature PRs target epic
gh pr create --base epic/foundation --title "Add Auth Types"

# 4. After all features merge to epic
git checkout epic/foundation
gh pr create --base main --title "Epic: Foundation Infrastructure"
```

## Dependency Management

### Setting Dependencies

**Via MCP Tool:**

```typescript
mcp__protolabs__set_feature_dependencies({
  projectPath: '/path/to/project',
  featureId: 'feature-456',
  dependsOn: ['feature-123', 'feature-789'],
});
```

**Via REST API:**

```bash
curl -X POST http://localhost:3008/api/features/set-dependencies \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "featureId": "feature-456",
    "dependsOn": ["feature-123", "feature-789"]
  }'
```

### Dependency Graph

**Get dependency graph:**

```typescript
const graph = await mcp__protolabs__get_dependency_graph({
  projectPath: '/path/to/project',
});
```

**Output:**

```json
{
  "nodes": [
    { "id": "feature-123", "title": "Add Auth Types" },
    { "id": "feature-456", "title": "JWT Service" }
  ],
  "edges": [{ "from": "feature-123", "to": "feature-456" }]
}
```

### Execution Order

**Get topologically sorted execution order:**

```typescript
const order = await mcp__protolabs__get_execution_order({
  projectPath: '/path/to/project',
});
```

**Output:**

```json
[
  "feature-123", // No dependencies
  "feature-456", // Depends on feature-123
  "feature-789" // Depends on feature-456
]
```

## Auto-Mode with Orchestration

Auto-mode processes features in dependency order:

```typescript
mcp__protolabs__start_auto_mode({
  projectPath: '/path/to/project',
  respectDependencies: true, // Wait for dependencies to complete
});
```

**Behavior:**

1. Calculate execution order
2. Start feature with no dependencies
3. Wait for completion (or review state)
4. Start next feature in order
5. Repeat until all features complete

**Foundation features:**

If a feature has `isFoundation: true`, downstream features wait for **merge**, not just review:

```typescript
{
  "id": "feature-123",
  "title": "Add Core Types",
  "isFoundation": true,  // Blockers wait for merge
  "status": "review"     // Downstream features still blocked
}
```

## API Reference

### Project Endpoints

**POST /api/projects/list** - List all projects

```bash
curl -X POST http://localhost:3008/api/projects/list \
  -H "Content-Type: application/json" \
  -d '{ "projectPath": "/path/to/project" }'
```

**POST /api/projects/get** - Get project details

```bash
curl -X POST http://localhost:3008/api/projects/get \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "projectSlug": "my-feature"
  }'
```

**POST /api/projects/create** - Create new project

**POST /api/projects/update** - Update project properties

```bash
curl -X POST http://localhost:3008/api/projects/update \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "projectSlug": "my-feature",
    "status": "active"
  }'
```

**POST /api/projects/delete** - Delete project

**POST /api/projects/create-features** - Convert phases to features

### MCP Tools

| Tool                       | Description                            |
| -------------------------- | -------------------------------------- |
| `create_project`           | Create project with PRD and milestones |
| `list_projects`            | List all projects in workspace         |
| `get_project`              | Get project with full details          |
| `update_project`           | Update project properties              |
| `delete_project`           | Delete project and files               |
| `create_project_features`  | Convert phases to board features       |
| `set_feature_dependencies` | Configure feature dependencies         |
| `get_dependency_graph`     | Get dependency visualization           |
| `get_execution_order`      | Get topologically sorted feature order |

## Best Practices

### 1. Use Epics for Large Projects

**Do:**

```
Epic: Foundation (5 features)
Epic: API Layer (8 features)
Epic: UI Components (6 features)
```

**Don't:**

```
19 independent features (hard to track)
```

### 2. Set Explicit Dependencies

**Do:**

```typescript
// Clear dependency chain
Feature: Add Types → Feature: Add Service → Feature: Add Routes
```

**Don't:**

```typescript
// Implicit assumptions (will break)
Features run in parallel without deps
```

### 3. Mark Foundation Work

**Do:**

```typescript
{
  "title": "Database Schema",
  "isFoundation": true,  // Blockers wait for merge
}
```

**Don't:**

```typescript
// UI features start before DB is merged
// → Runtime errors
```

### 4. Write Detailed Acceptance Criteria

**Do:**

```typescript
acceptanceCriteria: [
  'Types compile without errors',
  'Exported from package index',
  'Unit tests pass',
  'Used in service layer',
];
```

**Don't:**

```typescript
acceptanceCriteria: ['Done']; // Too vague
```

### 5. Use SPARC for PRDs

**Do:**

```
Situation: Current auth is cookie-based
Problem: Cookies don't work for mobile apps
Approach: Implement JWT with refresh flow
Results: Mobile + web supported
Constraints: Must maintain backward compatibility
```

**Don't:**

```
"We need JWT" // No context
```

## Troubleshooting

### "Cannot create features - project not found"

**Issue:** Project slug doesn't match filesystem.

**Solution:** Verify project exists:

```bash
ls .automaker/projects/
# Should show: my-feature/
```

### "Circular dependency detected"

**Issue:** Feature depends on itself (indirectly).

**Solution:** Review dependency chain:

```typescript
const graph = await mcp__protolabs__get_dependency_graph({
  projectPath: '/path/to/project',
});
// Visualize to find cycle
```

### "Epic PR has no commits"

**Issue:** Epic branch created but no features merged yet.

**Solution:** Merge at least one feature PR first:

```bash
# Merge feature into epic
gh pr merge <feature-pr-number>

# Then create epic PR
gh pr create --base main
```

## Learn More

- [Git Workflow](../dev/git-workflow.md) - Branch strategies and PR process
- [Shared Packages](../dev/shared-packages.md) - Dependency resolution package details
- [MCP Tools Reference](../integrations/mcp-tools-reference.md) - All orchestration tools
