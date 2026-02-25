# Automaker Agent Guide

## CRITICAL: Scope Discipline

Implement EXACTLY what the feature description says. Nothing more, nothing less.

- If the description says "create ServiceX", create ONLY ServiceX. Do NOT wire it into the server, create routes, or modify index.ts unless explicitly asked.
- If the description says "add types", add ONLY types. Do NOT create services that use those types.
- Other features in the backlog handle remaining work. Over-delivering creates merge conflicts and blocks other agents.
- When in doubt about scope, do LESS, not more.

## CRITICAL: Turn Budget

You have limited turns. Do NOT spend more than 20% exploring.

- Turns 1-3: Read feature description, identify the 2-3 files to modify
- Turns 4-6: Read ONLY those specific files
- Remaining turns: WRITE CODE
- If you're still reading files after turn 8, you're behind schedule
- Do NOT try to understand the entire codebase. Focus ONLY on files directly relevant to your task.

## Monorepo Structure

```
automaker/
├── apps/
│   ├── ui/           # React + Vite frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
└── libs/             # Shared packages (@protolabs-ai/*)
    ├── types/        # Core TypeScript definitions (NO dependencies)
    ├── utils/        # Logging, errors, image processing
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security
    ├── model-resolver/    # Model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    ├── policy-engine/     # Trust-based policy checking
    ├── spec-parser/       # XML/markdown spec parsing
    ├── git-utils/    # Git operations & worktree management
    └── ui/           # Shared UI components (atoms, molecules, theme)
```

## Package Dependency Chain (top = no deps)

```
@protolabs-ai/types
    ↓
@protolabs-ai/utils, prompts, platform, model-resolver, dependency-resolver, policy-engine, spec-parser
    ↓
@protolabs-ai/git-utils
    ↓
apps/server, apps/ui
```

## CRITICAL: Build Order

If you modify ANY file in `libs/`:
1. `npm run build:packages` FIRST
2. Then `npm run build:server`

Packages compile to `dist/`. Other packages import from `dist/`, NOT source.
Stale `dist/` = wrong types = wasted work.

## Import Conventions

```typescript
// ALWAYS import from packages
import type { Feature, ExecutionRecord } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';

// NEVER import from relative paths to other packages
// ❌ import { Feature } from '../services/feature-loader';
```

## Frontend UI Standards

For all frontend work, follow the UI standards in `ui-standards.md`. Always use shared components from `@protolabs-ai/ui` -- never bare HTML elements (`<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`). Never hardcode color classes (`bg-gray-*`, `text-blue-*`); always use semantic tokens (`bg-card`, `text-foreground`, `border-border`).

## Before Creating New Types

ALWAYS check `libs/types/src/` first. Types for features, settings, events, ceremonies, etc. already exist.
If a type exists, import it from `@protolabs-ai/types`. Do NOT recreate it.

## Key Existing Types (libs/types/src/)

- `Feature`, `FeatureStatus`, `ExecutionRecord`, `StatusTransition` — feature.ts
- `CeremonySettings`, `CeremonyType` — ceremony.ts, settings.ts
- `GitWorkflowSettings`, `GitWorkflowResult` — settings.ts
- `ProjectMetrics`, `CapacityMetrics` — (if they exist, check first)
- `EventType`, `EventCallback` — event.ts

## Server Service Pattern

Services are classes in `apps/server/src/services/`:
```typescript
import { createLogger } from '@protolabs-ai/utils';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('MyService');

export class MyService {
  constructor(private featureLoader: FeatureLoader) {}

  async doWork(projectPath: string) {
    const features = await this.featureLoader.getAll(projectPath);
    // ...
  }
}
```

## Common Commands

```bash
npm run build:packages      # Build shared packages (MUST run first)
npm run build:server        # Build server
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # Package tests
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Feature Data Fields (Feature interface)

Key fields available on every feature:
- `executionHistory?: ExecutionRecord[]` — per-execution timing, cost, tokens
- `costUsd?: number` — total cost
- `createdAt?, completedAt?, startedAt?, reviewStartedAt?` — lifecycle timestamps
- `prCreatedAt?, prMergedAt?, prReviewDurationMs?` — PR lifecycle
- `statusHistory?: StatusTransition[]` — all status changes
- `failureCount?, retryCount?` — failure tracking
- `complexity?: 'small' | 'medium' | 'large' | 'architectural'`

## Git Workflow — Three-Branch Strategy

All agent PRs target **`dev`** by default. The promotion flow is:

```text
feature/* ──▶ dev ──▶ staging ──▶ main
```

- **`dev`**: Active development. All agent-generated PRs land here.
- **`staging`**: Integration / QA environment. Promoted from `dev` via PR. Auto-deploys.
- **`main`**: Stable release only. PRs to `main` **must** come from `staging` — enforced by CI (`promotion-check`). Any PR to `main` from another branch will fail the `source-branch` required check.

**Never open a PR directly from a feature branch to `main`.** If you need to create a PR manually, target `dev`:

```bash
gh pr create --base dev --head feature/your-branch --title "..." --body "..."
```

The `gitWorkflow.prBaseBranch` setting is `"dev"` — auto-mode and the git workflow service read this automatically.

## Dev Server

NEVER start, stop, or restart the dev server. It's managed externally.

## PR Ownership (Multi-Instance Coordination)

When implementing features, every PR created by Automaker contains a hidden ownership watermark:

```html
<!-- automaker:owner instance=<instanceId> team=<teamId> created=<ISO8601> -->
```

This is appended automatically by `create-pr.ts` via `buildPROwnershipWatermark()`. You do not need to add it manually.

**WorktreeRecoveryService** runs after every agent exit. If you leave uncommitted changes in the worktree, it will:
1. Format changed files
2. Stage (excluding `.automaker/`)
3. Commit with `HUSKY=0`
4. Push and create a PR

If recovery fails, the feature is marked `blocked` with a `statusChangeReason`. The Lead Engineer will escalate rather than retry — retrying the agent won't resolve a git or network failure.

**Implication**: Commit your work before exiting. The recovery service is a safety net, not a substitute for proper commits.
