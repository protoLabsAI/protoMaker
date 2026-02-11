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
└── libs/             # Shared packages (@automaker/*)
    ├── types/        # Core TypeScript definitions (NO dependencies)
    ├── utils/        # Logging, errors, image processing
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security
    ├── model-resolver/    # Model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    ├── policy-engine/     # Trust-based policy checking
    ├── spec-parser/       # XML/markdown spec parsing
    └── git-utils/    # Git operations & worktree management
```

## Package Dependency Chain (top = no deps)

```
@automaker/types
    ↓
@automaker/utils, prompts, platform, model-resolver, dependency-resolver, policy-engine, spec-parser
    ↓
@automaker/git-utils
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
import type { Feature, ExecutionRecord } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import { resolveModelString } from '@automaker/model-resolver';

// NEVER import from relative paths to other packages
// ❌ import { Feature } from '../services/feature-loader';
```

## Before Creating New Types

ALWAYS check `libs/types/src/` first. Types for features, settings, events, ceremonies, etc. already exist.
If a type exists, import it from `@automaker/types`. Do NOT recreate it.

## Key Existing Types (libs/types/src/)

- `Feature`, `FeatureStatus`, `ExecutionRecord`, `StatusTransition` — feature.ts
- `CeremonySettings`, `CeremonyType` — ceremony.ts, settings.ts
- `GitWorkflowSettings`, `GitWorkflowResult` — settings.ts
- `ProjectMetrics`, `CapacityMetrics` — (if they exist, check first)
- `EventType`, `EventCallback` — event.ts

## Server Service Pattern

Services are classes in `apps/server/src/services/`:
```typescript
import { createLogger } from '@automaker/utils';
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

## Dev Server

NEVER start, stop, or restart the dev server. It's managed externally.
