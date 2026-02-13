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
├── policy-engine/      # Trust-based policy checking
├── spec-parser/        # XML/markdown spec parsing
├── git-utils/          # Git operations
├── flows/              # LangGraph state graph primitives
├── llm-providers/      # Multi-provider LLM abstraction
└── observability/      # Langfuse tracing and prompt management
```

## When to Use Each Package

### @automaker/types

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
import type { Feature, ExecuteOptions } from '@automaker/types';
```

**Never import from:** `services/feature-loader`, `providers/types`

### @automaker/utils

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
import { createLogger, classifyError } from '@automaker/utils';
```

**Never import from:** `lib/logger`, `lib/error-handler`, `lib/prompt-builder`, `lib/image-handler`

### @automaker/prompts

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
import { getEnhancementPrompt, isValidEnhancementMode } from '@automaker/prompts';

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

### @automaker/platform

**Use when:** You need to work with AutoMaker's directory structure or spawn processes.

**Import for:**

- `getAutomakerDir(projectPath)` - Get .automaker directory
- `getFeaturesDir(projectPath)` - Get features directory
- `getFeatureDir(projectPath, featureId)` - Get specific feature directory
- `ensureAutomakerDir(projectPath)` - Create .automaker if needed
- `spawnJSONLProcess()` - Spawn process with JSONL output
- `initAllowedPaths()` - Security path validation

**Example:**

```typescript
import { getFeatureDir, ensureAutomakerDir } from '@automaker/platform';
```

**Never import from:** `lib/automaker-paths`, `lib/subprocess-manager`, `lib/security`

### @automaker/model-resolver

**Use when:** You need to convert model aliases to full model IDs.

**Import for:**

- `resolveModelString(modelOrAlias)` - Convert alias to full ID
- `DEFAULT_MODELS` - Access default models

**Example:**

```typescript
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';

// Convert user input to model ID
const modelId = resolveModelString('sonnet'); // → 'claude-sonnet-4-20250514'

// Use default for auto-mode feature implementation
const autoModeModel = DEFAULT_MODELS.autoMode; // → sonnet
```

**Never import from:** `lib/model-resolver`

**Model aliases:**

- `haiku` → `claude-haiku-4-5` (fast, simple/trivial tasks)
- `sonnet` → `claude-sonnet-4-20250514` (balanced, feature implementation)
- `opus` → `claude-opus-4-5-20251101` (maximum capability, orchestration/architecture)

**DEFAULT_MODELS use cases:**

| Key                       | Model  | Use Case                                   |
| ------------------------- | ------ | ------------------------------------------ |
| `DEFAULT_MODELS.claude`   | opus   | Orchestration, planning, challenging work  |
| `DEFAULT_MODELS.autoMode` | sonnet | Auto-mode feature implementation (default) |
| `DEFAULT_MODELS.trivial`  | haiku  | Small/quick tasks                          |

### @automaker/dependency-resolver

**Use when:** You need to order features by dependencies or check if dependencies are satisfied.

**Import for:**

- `resolveDependencies(features)` - Topological sort with priority
- `areDependenciesSatisfied(feature, allFeatures, options?)` - Check if ready to execute
- `getBlockingDependencies(feature, allFeatures)` - Get incomplete dependencies

**Foundation dependency awareness:** Both `areDependenciesSatisfied()` and `getBlockingDependencies()` check each dependency's `isFoundation` flag. Foundation deps (package scaffolds, base types) require `done` status — `review` is not sufficient. This prevents agents from starting on stale worktrees before scaffold PRs are merged.

**Example:**

```typescript
import { resolveDependencies, areDependenciesSatisfied } from '@automaker/dependency-resolver';

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

### @automaker/git-utils

**Use when:** You need git operations, status parsing, or diff generation.

**Import for:**

- `isGitRepo(path)` - Check if path is a git repository
- `parseGitStatus(output)` - Parse `git status --porcelain` output
- `getGitRepositoryDiffs(path)` - Get complete diffs (tracked + untracked)
- `generateSyntheticDiffForNewFile()` - Create diff for untracked file
- `listAllFilesInDirectory()` - List files excluding build artifacts

**Example:**

```typescript
import { isGitRepo, getGitRepositoryDiffs } from '@automaker/git-utils';

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

### @automaker/flows

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
import { GraphBuilder, appendReducer, createBinaryRouter } from '@automaker/flows';
```

**Full documentation:** [Flows Package](./flows)

### @automaker/llm-providers

**Use when:** You need multi-provider LLM abstraction, provider configuration, or model management.

**Import for:**

- `ProviderFactory` - Singleton factory for provider management
- `BaseLLMProvider` - Base class for new providers
- `AnthropicProvider`, `OllamaProvider`, etc. - Provider implementations
- `validateProviderConfig`, `validateLLMProvidersConfig` - Zod validation
- `ANTHROPIC_MODELS`, `getModelIdForTier` - Default model configs

**Example:**

```typescript
import { ProviderFactory, AnthropicProvider } from '@automaker/llm-providers';
```

**Full documentation:** [LLM Providers Package](./llm-providers-package)

### @automaker/observability

**Use when:** You need Langfuse tracing, prompt versioning, or cost tracking.

**Import for:**

- `LangfuseClient` - Wrapper with graceful fallback
- `wrapProviderWithTracing` - Transparent async generator tracing
- `executeTrackedPrompt` - Prompt execution with full tracking
- `PromptCache`, `createPromptCache` - TTL-based prompt caching
- `getRawPrompt`, `pinPromptVersion`, `pinPromptLabel` - Prompt versioning

**Example:**

```typescript
import { LangfuseClient, wrapProviderWithTracing } from '@automaker/observability';
```

**Full documentation:** [Observability Package](./observability-package)

## Common Patterns

### Creating a Feature Executor

```typescript
import type { Feature, ExecuteOptions } from '@automaker/types';
import { createLogger, classifyError } from '@automaker/utils';
import { resolveModelString, DEFAULT_MODELS } from '@automaker/model-resolver';
import { areDependenciesSatisfied } from '@automaker/dependency-resolver';
import { getFeatureDir } from '@automaker/platform';

const logger = createLogger('FeatureExecutor');

async function executeFeature(feature: Feature, allFeatures: Feature[], projectPath: string) {
  // Check dependencies
  if (!areDependenciesSatisfied(feature, allFeatures)) {
    logger.warn(`Dependencies not satisfied for ${feature.id}`);
    return;
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
import { getGitRepositoryDiffs, parseGitStatus } from '@automaker/git-utils';
import { createLogger } from '@automaker/utils';

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
import type { Feature } from '@automaker/types';
import { resolveDependencies, getBlockingDependencies } from '@automaker/dependency-resolver';
import { createLogger } from '@automaker/utils';

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
// Import types from @automaker/types
import type { Feature, ExecuteOptions } from '@automaker/types';

// Import constants from @automaker/types
import { CLAUDE_MODEL_MAP, DEFAULT_MODELS } from '@automaker/types';

// Import utilities from @automaker/utils
import { createLogger, classifyError } from '@automaker/utils';

// Import prompts from @automaker/prompts
import { getEnhancementPrompt, isValidEnhancementMode } from '@automaker/prompts';

// Import platform utils from @automaker/platform
import { getFeatureDir, ensureAutomakerDir } from '@automaker/platform';

// Import model resolution from @automaker/model-resolver
import { resolveModelString } from '@automaker/model-resolver';

// Import dependency resolution from @automaker/dependency-resolver
import { resolveDependencies } from '@automaker/dependency-resolver';

// Import git utils from @automaker/git-utils
import { getGitRepositoryDiffs } from '@automaker/git-utils';
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

// DON'T define types that exist in @automaker/types
interface Feature { ... }  // ❌ Use: import type { Feature } from '@automaker/types';
```

## Migration Checklist

When refactoring server code, check:

- [ ] All `Feature` imports use `@automaker/types`
- [ ] All `ExecuteOptions` imports use `@automaker/types`
- [ ] All logger usage uses `@automaker/utils`
- [ ] All prompt templates use `@automaker/prompts`
- [ ] All path operations use `@automaker/platform`
- [ ] All model resolution uses `@automaker/model-resolver`
- [ ] All dependency checks use `@automaker/dependency-resolver`
- [ ] All git operations use `@automaker/git-utils`
- [ ] No imports from old `lib/` paths
- [ ] No imports from `services/feature-loader` for types
- [ ] No imports from `providers/types`

## Package Dependencies

Understanding the dependency chain helps prevent circular dependencies:

```
@automaker/types (no dependencies)
    ↓
@automaker/utils
@automaker/prompts
@automaker/platform
@automaker/model-resolver
@automaker/dependency-resolver
@automaker/policy-engine
@automaker/spec-parser
@automaker/observability
@automaker/llm-providers
@automaker/flows
    ↓
@automaker/git-utils
    ↓
@automaker/server
@automaker/ui
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
import type { Feature } from '@automaker/types';
import { createLogger } from '@automaker/utils';

// ❌ Don't import from src
import { Feature } from '../../../src/services/feature-loader';
```

## Summary for LLMs

**Quick reference:**

- Types → `@automaker/types`
- Logging/Errors/Utils → `@automaker/utils`
- AI Prompts → `@automaker/prompts`
- Paths/Security → `@automaker/platform`
- Model Resolution → `@automaker/model-resolver`
- Dependency Ordering → `@automaker/dependency-resolver`
- Git Operations → `@automaker/git-utils`
- LangGraph Flows → `@automaker/flows`
- LLM Providers → `@automaker/llm-providers`
- Tracing/Observability → `@automaker/observability`

**Never import from:** `lib/*`, `services/feature-loader` (for types), `providers/types`, `routes/common`

**Always:** Use the shared packages instead of local implementations.
