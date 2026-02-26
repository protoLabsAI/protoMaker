---
name: typescript-monorepo
description: Package dependency chain, import conventions, and build order for the TypeScript monorepo
triggers: [typescript, monorepo, packages, build, import, tsconfig]
---

# TypeScript Monorepo Patterns

## Package Dependency Chain

Packages can only depend on packages above them:

```
@protolabs-ai/types (no dependencies)
    ↓
@protolabs-ai/utils, @protolabs-ai/prompts, @protolabs-ai/platform,
@protolabs-ai/model-resolver, @protolabs-ai/dependency-resolver,
@protolabs-ai/spec-parser, @protolabs-ai/pen-parser, @protolabs-ai/tools,
@protolabs-ai/flows, @protolabs-ai/llm-providers, @protolabs-ai/observability
    ↓
@protolabs-ai/git-utils, @protolabs-ai/ui
    ↓
apps/server, apps/ui
```

## Import Conventions

Always import from shared packages, never from internal paths:

```typescript
// ✅ Correct
import type { Feature } from '@protolabs-ai/types';
import { createLogger } from '@protolabs-ai/utils';
import { getFeatureDir } from '@protolabs-ai/platform';
import { resolveModelString } from '@protolabs-ai/model-resolver';

// ❌ Wrong
import { Feature } from '../services/feature-loader';
import { createLogger } from '../lib/logger';
```

## Build Order

Always build packages before apps:

```bash
npm run build:packages   # Build all shared packages first
npm run build:server     # Then build the server
npm run build            # Or build everything (web app)
```

When adding a new export to a package, build that package before referencing it in other packages or apps.

## TypeScript Path Aliases

Each package uses `@/*` pointing to `./src/*` in tsconfig. The compiled output uses `.js` extensions in imports (even for `.ts` source files) because the packages compile to ESM.

```typescript
// In source: import from './my-module.js' (not .ts)
import { foo } from './my-module.js';
```
