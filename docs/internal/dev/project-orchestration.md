# Project Orchestration System

Reference for the hierarchical project-planning flow (Deep Research → SPARC PRD → Review → Approval → Scaffold → Features), epic git workflow, and the project API/MCP surface. Extracted from CLAUDE.md (#3907).

Automaker supports hierarchical project planning with the flow:

**Deep Research → SPARC PRD → Review → Approval → Scaffold → Features**

### Project Structure

```
.automaker/projects/{project-slug}/
├── project.md           # Project overview
├── project.json         # Full project data
├── prd.md              # SPARC PRD document
└── milestones/
    └── {milestone-slug}/
        ├── milestone.md
        └── phase-{N}-{name}.md
```

### Project Types (libs/types/src/project.ts)

```typescript
import type { Project, Milestone, Phase, SPARCPrd } from '@protolabsai/types';

// Project status lifecycle
type ProjectStatus =
  | 'researching'
  | 'drafting'
  | 'reviewing'
  | 'approved'
  | 'scaffolded'
  | 'active'
  | 'completed';

// Phase complexity for estimation
type PhaseComplexity = 'small' | 'medium' | 'large';
```

### Project API Routes

The server exposes project endpoints at `/api/projects/`:

- `POST /list` - List all project plans
- `POST /get` - Get project with milestones and phases
- `POST /create` - Create project and scaffold files
- `POST /update` - Update project properties
- `POST /delete` - Delete project and files
- `POST /create-features` - Convert phases to board features with epic support

### Epic Support

Features can be organized into epics for milestone grouping:

```typescript
interface Feature {
  // ... existing fields
  isEpic?: boolean; // True if this is an epic (container feature)
  epicId?: string; // Parent epic ID (for child features)
  epicColor?: string; // Badge color (hex)
  isFoundation?: boolean; // Downstream deps wait for merge (not just review)
}
```

### Epic Git Workflow

When features belong to an epic, the git workflow follows a hierarchical PR structure:

```
base branch (prBaseBranch, default: main)
  ↑
epic/foundation ──────────── Epic PR (targets the base branch)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

This repo uses a single integration branch (`feature/* → main`). The epic flow inserts an
epic branch between feature branches and the base branch — it does **not** introduce a separate
long-lived `dev` branch. Everywhere below, "base branch" means the project's configured
`prBaseBranch` (`DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch`, default `main`), resolved via
`getEffectivePrBaseBranch()`. Never hardcode a branch name in orchestration code.

**Automatic Behavior:**

- Epic branches are created from the resolved base branch HEAD (`origin/<base>`), not a literal.
- Feature PRs automatically target their epic's branch (not the base branch directly).
- Epic PRs target the base branch (never bypass it).
- Features without an epic target the base branch directly.
- When the last child feature's PR merges to the epic branch, `CompletionDetectorService` automatically creates the epic-to-base PR with `--merge` auto-merge enabled.
- When the epic-to-base PR merges (detected by GitHub webhook), the epic is marked `done` and the epic branch is deleted.
- If the epic-to-base PR has conflicts, the epic is marked `blocked` with a reason explaining manual intervention is needed.

**Epic Lifecycle:**

```
children in_progress → children done → epic PR created (review) → epic PR merges → epic done
```

**Merge Order:**

1. Merge all feature PRs into the epic branch (squash OK)
2. Epic-to-base PR is auto-created and auto-merged with `--merge` strategy (never squash)

This keeps the base branch clean while allowing incremental feature development within epics.

### Creating a Project via MCP

```typescript
// Create project plan
mcp__protolabs__create_project({
  projectPath: '/path/to/project',
  title: 'My Feature',
  goal: 'Implement X functionality',
  prd: {
    situation: 'Current state...',
    problem: 'The issue is...',
    approach: 'We will...',
    results: 'Expected outcomes...',
    constraints: ['Constraint 1', 'Constraint 2'],
  },
  milestones: [
    {
      title: 'Foundation',
      description: 'Core infrastructure',
      phases: [
        {
          title: 'Add Types',
          description: 'Create TypeScript types...',
          filesToModify: ['src/types/index.ts'],
          acceptanceCriteria: ['Types compile', 'Exported correctly'],
          complexity: 'small',
        },
      ],
    },
  ],
});

// Convert to board features
mcp__protolabs__create_project_features({
  projectPath: '/path/to/project',
  projectSlug: 'my-feature',
  createEpics: true,
  setupDependencies: true,
});
```
