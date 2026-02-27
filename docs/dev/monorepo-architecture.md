# Monorepo Architecture

Automaker is built as an npm workspace monorepo, providing a modular and maintainable codebase structure. This guide explains how the repository is organized and how packages interact.

## Repository Structure

```
automaker/
├── apps/
│   ├── ui/           # React + Vite + Electron frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
├── site/             # Landing page (protolabs.studio) — static HTML on Cloudflare Pages
└── libs/             # Shared packages (@protolabs-ai/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    ├── spec-parser/       # XML/markdown spec parsing for project plans
    ├── pen-parser/        # PEN file parser for Penpot design files
    ├── git-utils/    # Git operations & worktree management
    ├── tools/        # Unified tool definition and registry system
    ├── flows/        # LangGraph state graph primitives & flow orchestration
    ├── observability/# Langfuse tracing, prompt versioning & cost tracking
    └── ui/           # Shared UI components (@protolabs-ai/ui) — atoms, molecules, theme
```

## Package Dependency Chain

Packages follow a strict layered dependency hierarchy. Lower-level packages cannot depend on higher-level ones:

```
@protolabs-ai/types (no dependencies)
    ↓
@protolabs-ai/utils, @protolabs-ai/prompts, @protolabs-ai/platform,
@protolabs-ai/model-resolver, @protolabs-ai/dependency-resolver,
@protolabs-ai/spec-parser, @protolabs-ai/pen-parser, @protolabs-ai/tools,
@protolabs-ai/flows, @protolabs-ai/observability
    ↓
@protolabs-ai/git-utils, @protolabs-ai/ui
    ↓
apps/server, apps/ui (applications)
```

**Why this matters:**

- **Prevents circular dependencies** - Clear hierarchy makes builds predictable
- **Enables incremental builds** - Change a low-level package, rebuild only dependents
- **Improves testability** - Lower-level packages are easier to test in isolation
- **Supports code reuse** - Shared packages can be extracted to separate repos if needed

## Core Package Responsibilities

### @protolabs-ai/types

Foundation layer with zero dependencies. Contains all TypeScript interfaces and types used across the project.

**Key exports:**

```typescript
import type {
  Feature,
  FeatureStatus,
  AgentTemplate,
  Project,
  Milestone,
  Phase,
} from '@protolabs-ai/types';
```

**Rule:** Never import from other `@protolabs-ai/*` packages. External deps (zod, etc.) are allowed.

### @protolabs-ai/utils

Common utilities for logging, error handling, image processing, and context file loading.

**Key exports:**

```typescript
import {
  createLogger, // Winston-based logger
  classifyError, // Error categorization
  loadContextFiles, // Load .automaker/context/*.md
} from '@protolabs-ai/utils';
```

### @protolabs-ai/prompts

AI prompt templates for agents, organized by role (PM, engineer, specialist).

**Key exports:**

```typescript
import {
  getEnhancementPrompt, // Feature enhancement prompts
  getAgentSystemPrompt, // Agent role system prompts
} from '@protolabs-ai/prompts';
```

### @protolabs-ai/platform

Path management, security checks, and process spawning utilities.

**Key exports:**

```typescript
import {
  getFeatureDir, // Get .automaker/features/{id}
  ensureAutomakerDir, // Create .automaker/ structure
  spawnChildProcess, // Secure process spawning
} from '@protolabs-ai/platform';
```

### @protolabs-ai/model-resolver

Converts model aliases to full model strings.

**Key exports:**

```typescript
import { resolveModelString } from '@protolabs-ai/model-resolver';

// Usage
resolveModelString('sonnet'); // → 'claude-sonnet-4-6'
resolveModelString('opus'); // → 'claude-opus-4-6'
resolveModelString('haiku'); // → 'claude-haiku-4-5-20251001'
```

See [Model Resolver Guide](../server/model-resolver.md) for details.

### @protolabs-ai/dependency-resolver

Resolves feature dependencies and determines execution order.

**Key exports:**

```typescript
import { resolveDependencies } from '@protolabs-ai/dependency-resolver';
```

### @protolabs-ai/git-utils

Git operations and worktree management.

**Key exports:**

```typescript
import {
  getGitRepositoryDiffs, // Get diffs between branches
  createWorktree, // Create isolated worktree
  cleanupWorktree, // Remove worktree
} from '@protolabs-ai/git-utils';
```

### @protolabs-ai/tools

Unified tool definition and registry system for AI agents.

**Key exports:**

```typescript
import {
  ToolRegistry, // Tool registration and lookup
  createTool, // Tool factory
  ToolDefinition, // Tool schema
} from '@protolabs-ai/tools';
```

### @protolabs-ai/flows

LangGraph state graph primitives and flow orchestration for multi-agent workflows.

**Key exports:**

```typescript
import {
  StateGraph, // Graph construction
  StateNode, // Node definition
  executeFlow, // Flow executor
} from '@protolabs-ai/flows';
```

### @protolabs-ai/observability

Langfuse tracing, prompt versioning, and cost tracking.

**Key exports:**

```typescript
import {
  initializeLangfuse, // Setup Langfuse client
  traceAgentExecution, // Trace agent runs
  trackPromptVersion, // Version prompts
} from '@protolabs-ai/observability';
```

### @protolabs-ai/ui

Shared React components using atomic design pattern (atoms, molecules, organisms).

**Key exports:**

```typescript
import {
  Button, // Atom components
  Card, // Molecule components
  theme, // Tailwind CSS theme
} from '@protolabs-ai/ui';
```

## Import Conventions

**Always import from shared packages:**

```typescript
// ✅ Correct
import type { Feature, ExecuteOptions } from '@protolabs-ai/types';
import { createLogger, classifyError } from '@protolabs-ai/utils';
import { getEnhancementPrompt } from '@protolabs-ai/prompts';
import { getFeatureDir, ensureAutomakerDir } from '@protolabs-ai/platform';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { resolveDependencies } from '@protolabs-ai/dependency-resolver';
import { getGitRepositoryDiffs } from '@protolabs-ai/git-utils';

// ❌ Never import from relative paths in apps/
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

**Why:**

- Enforces package boundaries
- Makes refactoring safer
- Enables potential package extraction
- Improves IDE autocomplete and jump-to-definition

## Building the Monorepo

### Build Order

Due to package dependencies, builds must happen in order:

```bash
# 1. Build all shared packages first
npm run build:packages

# 2. Then build applications
npm run build:server
npm run build           # Builds UI
npm run build:electron  # Builds desktop app
```

The `build:packages` script runs:

```bash
npx turbo build --filter="./libs/*"
```

This uses [Turbo](https://turbo.build/) to build packages in dependency order with caching.

### Development Workflow

During development, you typically don't need to rebuild packages constantly:

```bash
# Start dev server (auto-imports TypeScript from libs/)
npm run dev:web

# Or start Electron in dev mode
npm run dev:electron
```

**When to rebuild packages:**

- After pulling changes that modify `libs/`
- After changing a package's exports or types
- Before running E2E tests
- Before building for production

### Testing Strategy

```bash
# Test all packages
npm run test:packages

# Test server (unit tests)
npm run test:server

# Test E2E (requires built packages)
npm run build:packages
npm run test
```

## Adding a New Package

If you need to create a new shared package:

1. **Create package directory:**

```bash
mkdir -p libs/my-package/src
cd libs/my-package
```

2. **Create `package.json`:**

```json
{
  "name": "@protolabs-ai/my-package",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest"
  },
  "dependencies": {
    "@protolabs-ai/types": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "vitest": "^2.1.8"
  }
}
```

3. **Create `tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

4. **Create `tsup.config.ts`:**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

5. **Add to workspace root `package.json`:**

Ensure the `workspaces` field includes `libs/*`.

6. **Install dependencies:**

```bash
npm install
```

7. **Verify position in dependency chain** - Check the hierarchy diagram above and ensure your package only depends on packages at the same or lower level.

## Troubleshooting

### "Cannot find module '@protolabs-ai/xyz'"

**Solution:** Build packages first:

```bash
npm run build:packages
```

### "Circular dependency detected"

**Solution:** Check your imports. You may be importing from a higher-level package. Review the dependency chain diagram.

### "Types are out of sync"

**Solution:** Rebuild packages and restart TypeScript server:

```bash
npm run build:packages
# In VSCode: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

### "Tests fail after package changes"

**Solution:** Rebuild and re-run tests:

```bash
npm run build:packages
npm run test:packages
```

## Learn More

- [Git Workflow](./git-workflow.md) - Branch strategies and PR process
- [Environment Setup](./environment-setup.md) - Required environment variables
- [Shared Packages](./shared-packages.md) - Detailed package documentation
- [Testing Patterns](./testing-patterns.md) - Testing strategies for the monorepo
