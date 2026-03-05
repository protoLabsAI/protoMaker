# AutoMaker Shared Packages - LLM Guide

This guide helps AI assistants understand how to use AutoMaker's shared packages effectively.

## Package Overview

AutoMaker uses a monorepo structure with shared packages in `libs/`:

```
libs/
├── types/              # Type definitions (no dependencies)
├── utils/              # Utility functions
├── prompts/            # AI prompt templates
├── platform/           # Platform utilities
├── model-resolver/     # Claude model resolution
├── dependency-resolver/# Feature dependency resolution
├── tools/              # Unified tool definition and registry system
├── spec-parser/        # XML/markdown spec parsing
├── git-utils/          # Git operations
├── flows/              # LangGraph state graph primitives
└── observability/      # Langfuse tracing and cost tracking
```

## When to Use Each Package

### @protolabsai/types

**Use when:** You need type definitions for any AutoMaker concept.

**Import for:**

- `Feature` - Feature interface with all properties
- `ExecuteOptions` - Claude agent execution options
- `ConversationMessage` - Chat message format
- `ErrorType`, `ErrorInfo` - Error handling types
- `CLAUDE_MODEL_MAP` - Model alias to ID mapping
- `DEFAULT_MODELS` - Default model configurations

**Example:**

```typescript
import type { Feature, ExecuteOptions } from '@protolabsai/types';
```

**Never import from:** `services/feature-loader`, `providers/types`

### @protolabsai/utils

**Use when:** You need common utilities like logging, error handling, or image processing.

**Import for:**

- `createLogger(context)` - Structured logging
- `isAbortError(error)` - Error type checking
- `classifyError(error)` - Error classification
- `buildPromptWithImages()` - Prompt building with images
- `readImageAsBase64()` - Image handling
- `extractTextFromContent()` - Message parsing

**Example:**

```typescript
import { createLogger, classifyError } from '@protolabsai/utils';
```

**Never import from:** `lib/logger`, `lib/error-handler`, `lib/prompt-builder`, `lib/image-handler`

### @protolabsai/prompts

**Use when:** You need AI prompt templates for text enhancement or other AI-powered features.

**Import for:**

- `getEnhancementPrompt(mode)` - Get complete prompt for enhancement mode
- `getSystemPrompt(mode)` - Get system prompt for specific mode
- `getExamples(mode)` - Get few-shot examples for a mode
- `buildUserPrompt(description, mode)` - Build user prompt with examples
- `isValidEnhancementMode(mode)` - Check if mode is valid
- `IMPROVE_SYSTEM_PROMPT` - System prompt for improving vague descriptions
- `TECHNICAL_SYSTEM_PROMPT` - System prompt for adding technical details
- `SIMPLIFY_SYSTEM_PROMPT` - System prompt for simplifying verbose text
- `ACCEPTANCE_SYSTEM_PROMPT` - System prompt for adding acceptance criteria

**Example:**

```typescript
import { getEnhancementPrompt, isValidEnhancementMode } from '@protolabsai/prompts';

if (isValidEnhancementMode('improve')) {
  const { systemPrompt, userPrompt } = getEnhancementPrompt('improve', description);
  const result = await callClaude(systemPrompt, userPrompt);
}
```

**Never import from:** `lib/enhancement-prompts`

**Enhancement modes:**

- `improve` - Transform vague requests into clear, actionable tasks
- `technical` - Add implementation details and technical specifications
- `simplify` - Make verbose descriptions concise and focused
- `acceptance` - Add testable acceptance criteria

### @protolabsai/platform

**Use when:** You need to work with AutoMaker's directory structure, spawn processes, or detect/launch code editors.

**Import for:**

- `getprotoLabsDir(projectPath)` - Get .automaker directory
- `getFeaturesDir(projectPath)` - Get features directory
- `getFeatureDir(projectPath, featureId)` - Get specific feature directory
- `ensureprotoLabsDir(projectPath)` - Create .automaker if needed
- `spawnJSONLProcess()` - Spawn process with JSONL output
- `initAllowedPaths()` - Security path validation
- `detectAllEditors()` - Detect all installed editors on the system (cached 5 min)
- `detectDefaultEditor()` - Get the highest-priority installed editor
- `openInEditor(path, editorCommand?)` - Open a path in the specified (or default) editor
- `openInFileManager(path)` - Open a path in the platform file manager
- `openInTerminal(path)` - Open a terminal in the specified directory
- `clearEditorCache()` - Invalidate the editor detection cache
- `commandExists(cmd)` - Check if a CLI command is in PATH

**Supported editors** (in priority order): Cursor, VS Code, VS Code Insiders, Kiro, Zed, Sublime Text, Windsurf, Trae (ByteDance), Rider, WebStorm, Xcode, Android Studio, Antigravity. Falls back to Finder/Explorer/xdg-open.

**Adding a new editor:** Add an entry to `SUPPORTED_EDITORS` in `libs/platform/src/editor.ts`, add an icon component to `apps/ui/src/components/icons/editor-icons.tsx`, and register it in `getEditorIcon()`.

**Example:**

```typescript
import { getFeatureDir, ensureprotoLabsDir } from '@protolabsai/platform';
import { detectAllEditors, openInEditor } from '@protolabsai/platform';

// Detect all installed editors
const editors = await detectAllEditors();

// Open a path in the user's preferred editor
await openInEditor('/path/to/project', 'cursor');
```

**Never import from:** `lib/automaker-paths`, `lib/subprocess-manager`, `lib/security`

### @protolabsai/model-resolver

**Use when:** You need to convert model aliases to full model IDs.

**Import for:**

- `resolveModelString(modelOrAlias)` - Convert alias to full ID
- `DEFAULT_MODELS` - Access default models

**Example:**

```typescript
import { resolveModelString, DEFAULT_MODELS } from '@protolabsai/model-resolver';

// Convert user input to model ID
const modelId = resolveModelString('sonnet'); // → 'claude-sonnet-4-5-20250929'

// Use default for auto-mode feature implementation
const autoModeModel = DEFAULT_MODELS.autoMode; // → sonnet
```

**Never import from:** `lib/model-resolver`

**Model aliases:**

- `haiku` → `claude-haiku-4-5-20251001` (fast, simple/trivial tasks)
- `sonnet` → `claude-sonnet-4-5-20250929` (balanced, feature implementation)
- `opus` → `claude-opus-4-5-20251101` (maximum capability, orchestration/architecture)

**DEFAULT_MODELS use cases:**

| Key                       | Model  | Use Case                                   |
| ------------------------- | ------ | ------------------------------------------ |
| `DEFAULT_MODELS.claude`   | opus   | Orchestration, planning, challenging work  |
| `DEFAULT_MODELS.autoMode` | sonnet | Auto-mode feature implementation (default) |
| `DEFAULT_MODELS.trivial`  | haiku  | Small/quick tasks                          |

### @protolabsai/dependency-resolver

**Use when:** You need to order features by dependencies or check if dependencies are satisfied.

**Import for:**

- `resolveDependencies(features)` - Topological sort with priority
- `areDependenciesSatisfied(feature, allFeatures, options?)` - Check if ready to execute
- `getBlockingDependencies(feature, allFeatures)` - Get incomplete dependencies

**Foundation dependency awareness:** Both `areDependenciesSatisfied()` and `getBlockingDependencies()` check each dependency's `isFoundation` flag. Foundation deps (package scaffolds, base types) require `done` status — `review` is not sufficient. This prevents agents from starting on stale worktrees before scaffold PRs are merged.

**Example:**

```typescript
import { resolveDependencies, areDependenciesSatisfied } from '@protolabsai/dependency-resolver';

const { orderedFeatures, hasCycle } = resolveDependencies(features);
if (!hasCycle) {
  for (const feature of orderedFeatures) {
    if (areDependenciesSatisfied(feature, features)) {
      await execute(feature);
    }
  }
}
```

**Never import from:** `lib/dependency-resolver`

**Used in:**

- Auto-mode feature execution (server)
- Board view feature ordering (UI)

### @protolabsai/git-utils

**Use when:** You need git operations, status parsing, or diff generation.

**Import for:**

- `isGitRepo(path)` - Check if path is a git repository
- `parseGitStatus(output)` - Parse `git status --porcelain` output
- `getGitRepositoryDiffs(path)` - Get complete diffs (tracked + untracked)
- `generateSyntheticDiffForNewFile()` - Create diff for untracked file
- `listAllFilesInDirectory()` - List files excluding build artifacts

**Example:**

```typescript
import { isGitRepo, getGitRepositoryDiffs } from '@protolabsai/git-utils';

if (await isGitRepo(projectPath)) {
  const { diff, files, hasChanges } = await getGitRepositoryDiffs(projectPath);
  console.log(`Found ${files.length} changed files`);
}
```

**Never import from:** `routes/common`

**Handles:**

- Binary file detection
- Large file handling (>1MB)
- Untracked file diffs
- Non-git directory support

### @protolabsai/flows

**Use when:** You need LangGraph state graph primitives, multi-agent coordination, or flow orchestration.

**Import for:**

- `GraphBuilder` - Fluent API for building state graphs
- `createLinearGraph`, `createLoopGraph`, `createBranchingGraph` - Common graph patterns
- `createStateAnnotation` - Bridge Zod schemas to LangGraph Annotation.Root
- `appendReducer`, `fileReducer`, `todoReducer`, `counterReducer` - State reducers
- `createBinaryRouter`, `createValueRouter`, `createFieldRouter` - Routing utilities
- `wrapSubgraph` - Subgraph isolation wrapper
- `createCoordinatorGraph` - Reference coordinator with Send() fan-out

**Example:**

```typescript
import { GraphBuilder, appendReducer, createBinaryRouter } from '@protolabsai/flows';
```

**Full documentation:** [Flows Package](./flows)

### @protolabsai/observability

**Use when:** You need Langfuse tracing, prompt versioning, or cost tracking.

**Import for:**

- `LangfuseClient` - Wrapper with graceful fallback
- `wrapProviderWithTracing` - Transparent async generator tracing
- `executeTrackedPrompt` - Prompt execution with full tracking
- `PromptCache`, `createPromptCache` - TTL-based prompt caching
- `getRawPrompt`, `pinPromptVersion`, `pinPromptLabel` - Prompt versioning

**Example:**

```typescript
import { LangfuseClient, wrapProviderWithTracing } from '@protolabsai/observability';
```

**Full documentation:** [Observability Package](./observability-package)

## Common Patterns

### Creating a Feature Executor

```typescript
import type { Feature, ExecuteOptions } from '@protolabsai/types';
import { createLogger, classifyError } from '@protolabsai/utils';
import { resolveModelString, DEFAULT_MODELS } from '@protolabsai/model-resolver';
import { areDependenciesSatisfied } from '@protolabsai/dependency-resolver';
import { getFeatureDir } from '@protolabsai/platform';

const logger = createLogger('FeatureExecutor');

// Note: In production, feature execution is handled by the Lead Engineer
// state machine (leadEngineerService.process()). This example shows how
// shared packages compose for lower-level operations.
async function checkFeatureReadiness(
  feature: Feature,
  allFeatures: Feature[],
  projectPath: string
) {
  // Check dependencies
  if (!areDependenciesSatisfied(feature, allFeatures)) {
    logger.warn(`Dependencies not satisfied for ${feature.id}`);
    return false;
  }

  // Resolve model
  const model = resolveModelString(feature.model, DEFAULT_MODELS.autoMode);

  // Get feature directory
  const featureDir = getFeatureDir(projectPath, feature.id);

  try {
    // Execute with Claude
    const options: ExecuteOptions = {
      model,
      temperature: 0.7,
    };

    await runAgent(featureDir, options);

    logger.info(`Feature ${feature.id} completed`);
  } catch (error) {
    const errorInfo = classifyError(error);
    logger.error(`Feature ${feature.id} failed:`, errorInfo.message);
  }
}
```

### Analyzing Git Changes

```typescript
import { getGitRepositoryDiffs, parseGitStatus } from '@protolabsai/git-utils';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('GitAnalyzer');

async function analyzeChanges(projectPath: string) {
  const { diff, files, hasChanges } = await getGitRepositoryDiffs(projectPath);

  if (!hasChanges) {
    logger.info('No changes detected');
    return;
  }

  // Group by status
  const modified = files.filter((f) => f.status === 'M');
  const added = files.filter((f) => f.status === 'A');
  const deleted = files.filter((f) => f.status === 'D');
  const untracked = files.filter((f) => f.status === '?');

  logger.info(
    `Changes: ${modified.length}M ${added.length}A ${deleted.length}D ${untracked.length}U`
  );

  return diff;
}
```

### Ordering Features for Execution

```typescript
import type { Feature } from '@protolabsai/types';
import { resolveDependencies, getBlockingDependencies } from '@protolabsai/dependency-resolver';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('FeatureOrdering');

function orderAndFilterFeatures(features: Feature[]): Feature[] {
  const { orderedFeatures, hasCycle, cyclicFeatures } = resolveDependencies(features);

  if (hasCycle) {
    logger.error(`Circular dependency detected: ${cyclicFeatures.join(' → ')}`);
    throw new Error('Cannot execute features with circular dependencies');
  }

  // Filter to only ready features
  const readyFeatures = orderedFeatures.filter((feature) => {
    const blocking = getBlockingDependencies(feature, features);
    if (blocking.length > 0) {
      logger.debug(`${feature.id} blocked by: ${blocking.join(', ')}`);
      return false;
    }
    return true;
  });

  logger.info(`${readyFeatures.length} of ${features.length} features ready`);
  return readyFeatures;
}
```

## Import Rules for LLMs

### ✅ DO

```typescript
// Import types from @protolabsai/types
import type { Feature, ExecuteOptions } from '@protolabsai/types';

// Import constants from @protolabsai/types
import { CLAUDE_MODEL_MAP, DEFAULT_MODELS } from '@protolabsai/types';

// Import utilities from @protolabsai/utils
import { createLogger, classifyError } from '@protolabsai/utils';

// Import prompts from @protolabsai/prompts
import { getEnhancementPrompt, isValidEnhancementMode } from '@protolabsai/prompts';

// Import platform utils from @protolabsai/platform
import { getFeatureDir, ensureprotoLabsDir } from '@protolabsai/platform';

// Import model resolution from @protolabsai/model-resolver
import { resolveModelString } from '@protolabsai/model-resolver';

// Import dependency resolution from @protolabsai/dependency-resolver
import { resolveDependencies } from '@protolabsai/dependency-resolver';

// Import git utils from @protolabsai/git-utils
import { getGitRepositoryDiffs } from '@protolabsai/git-utils';
```

### ❌ DON'T

```typescript
// DON'T import from old paths
import { Feature } from '../services/feature-loader';           // ❌
import { ExecuteOptions } from '../providers/types';            // ❌
import { createLogger } from '../lib/logger';                   // ❌
import { resolveModelString } from '../lib/model-resolver';     // ❌
import { isGitRepo } from '../routes/common';                   // ❌
import { resolveDependencies } from '../lib/dependency-resolver'; // ❌
import { getEnhancementPrompt } from '../lib/enhancement-prompts'; // ❌

// DON'T import from old lib/ paths
import { getFeatureDir } from '../lib/automaker-paths';         // ❌
import { classifyError } from '../lib/error-handler';           // ❌

// DON'T define types that exist in @protolabsai/types
interface Feature { ... }  // ❌ Use: import type { Feature } from '@protolabsai/types';
```

## Migration Checklist

When refactoring server code, check:

- [ ] All `Feature` imports use `@protolabsai/types`
- [ ] All `ExecuteOptions` imports use `@protolabsai/types`
- [ ] All logger usage uses `@protolabsai/utils`
- [ ] All prompt templates use `@protolabsai/prompts`
- [ ] All path operations use `@protolabsai/platform`
- [ ] All model resolution uses `@protolabsai/model-resolver`
- [ ] All dependency checks use `@protolabsai/dependency-resolver`
- [ ] All git operations use `@protolabsai/git-utils`
- [ ] No imports from old `lib/` paths
- [ ] No imports from `services/feature-loader` for types
- [ ] No imports from `providers/types`

## Package Dependencies

Understanding the dependency chain helps prevent circular dependencies:

```
@protolabsai/types (no dependencies)
    ↓
@protolabsai/utils
@protolabsai/prompts
@protolabsai/platform
@protolabsai/model-resolver
@protolabsai/dependency-resolver
@protolabsai/spec-parser
@protolabsai/observability
@protolabsai/flows
@protolabsai/tools
    ↓
@protolabsai/git-utils
    ↓
@protolabsai/server
@protolabsai/ui
```

**Rule:** Packages can only depend on packages above them in the chain.

## Building Packages

All packages must be built before use:

```bash
# Build all packages from workspace
npm run build:packages

# Or from root
npm install  # Installs and links workspace packages
```

## Module Format

All packages use ES modules (`type: "module"`) with NodeNext module resolution:

- Requires explicit `.js` extensions in import statements
- Compatible with both Node.js (server) and Vite (UI)
- Centralized ESM configuration in `libs/tsconfig.base.json`

## Testing

When writing tests:

```typescript
// ✅ Import from packages
import type { Feature } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';

// ❌ Don't import from src
import { Feature } from '../../../src/services/feature-loader';
```

## Summary for LLMs

**Quick reference:**

- Types → `@protolabsai/types`
- Logging/Errors/Utils → `@protolabsai/utils`
- AI Prompts → `@protolabsai/prompts`
- Paths/Security → `@protolabsai/platform`
- Model Resolution → `@protolabsai/model-resolver`
- Dependency Ordering → `@protolabsai/dependency-resolver`
- Git Operations → `@protolabsai/git-utils`
- LangGraph Flows → `@protolabsai/flows`
- Tracing/Observability → `@protolabsai/observability`
- Tool Definitions → `@protolabsai/tools`

**Never import from:** `lib/*`, `services/feature-loader` (for types), `providers/types`, `routes/common`

**Always:** Use the shared packages instead of local implementations.
