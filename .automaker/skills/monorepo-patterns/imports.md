---
name: monorepo-imports
description: Import conventions for the Automaker monorepo. Always use @protolabsai/* workspace packages, never relative cross-package paths.
tags: [imports, monorepo, typescript, packages]
---

# Import Conventions

**Always import from `@protolabsai/*` workspace packages. Never use relative paths that cross package boundaries.**

## Correct Imports

```typescript
// Types from the shared types package
import type { Feature, AgentStatus, BoardColumn } from '@protolabsai/types';

// Utilities from shared utils
import { createLogger, sleep, formatDate } from '@protolabsai/utils';

// Git operations
import { getChangedFiles, createWorktree } from '@protolabsai/git-utils';

// Model resolution
import { resolveModel } from '@protolabsai/model-resolver';

// Prompts
import { buildSystemPrompt } from '@protolabsai/prompts';
```

## Incorrect Imports (Anti-Patterns)

```typescript
// WRONG: relative path crossing package boundary
import { Feature } from '../../libs/types/src/feature';
import { createLogger } from '../../../libs/utils/src/logger';

// WRONG: importing from another app's source
import { featureLoader } from '../../server/src/services/feature-loader';

// WRONG: importing from dist/ directly
import { Feature } from '../../../libs/types/dist/index';

// WRONG: bypassing workspace resolution
import type { Feature } from '/Users/kj/dev/automaker/libs/types/src/types';
```

## Package Dependency Chain

Packages MUST only depend on packages above them in the chain. Violating this creates circular imports that break the build.

```
@protolabsai/types            <- no dependencies, foundation for everything
         |
@protolabsai/utils
@protolabsai/prompts
@protolabsai/platform
@protolabsai/model-resolver
@protolabsai/dependency-resolver
@protolabsai/spec-parser
         |
@protolabsai/git-utils        <- depends on types + utils
         |
@protolabsai/mcp-server       <- depends on all above (lives in packages/)
         |
apps/server                    <- depends on all above
apps/ui                        <- depends on @protolabsai/types only (browser-safe)
```
