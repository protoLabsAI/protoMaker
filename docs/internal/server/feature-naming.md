# Feature Naming Reference

Server-side naming pipeline for features: title generation and branch-name generation. Both run entirely in `apps/server/` after the title-gen fix that moved title generation from the UI to the server create handler.

---

## Table of Contents

1. [Overview](#overview)
2. [Title Generator](#title-generator)
3. [Branch Name Generator](#branch-name-generator)
4. [Model Settings](#model-settings)
5. [Where Each Runs](#where-each-runs)
6. [Fallbacks](#fallbacks)
7. [Training Capture](#training-capture)
8. [Parity Test](#parity-test)

---

## Overview

```
Feature create request (description only, no title)
    │
    ├── POST /api/features/create  (create.ts)
    │       │
    │       ├── 1. Quarantine pipeline (sanitization)
    │       ├── 2. Title generator (title-generator.ts) ← if title is empty
    │       │       └── generateFeatureTitle(description, settingsService, projectPath)
    │       │           └── simpleQuery(titleGenerationModel) → title string | null
    │       │
    │       └── 3. FeatureLoader.create() (feature-loader.ts)
    │               └── Branch name generation
    │                   ├── Smart generator (branch-name-generator.ts) ← if enabled
    │                   │   └── simpleQuery(branchNameModel) → smart branch | null
    │                   └── Deterministic fallback (generateBranchName)
    │                       └── slugify(title) + shortId → "feature/slug-abc1234"
    │
    └── Created feature has: title (generated or empty) + branchName (always present unless read-only)
```

Both generators run **server-side**. All creation entry points (UI, CLI, MCP, API, internal) hit the same `POST /api/features/create` handler, so title and branch naming is consistent regardless of source.

---

## Title Generator

**File:** `apps/server/src/services/title-generator.ts`

**Function:** `generateFeatureTitle(description, settingsService?, projectPath?)`

**Input:** Feature description string  
**Output:** Generated title string, or `null` on failure/empty input  
**Throws:** Never — catches all errors and returns `null`

### How it works

1. Trims the description; returns `null` if empty
2. Loads customized prompt via `getPromptCustomization()` → `titleGeneration.systemPrompt`
3. Resolves model via `getPhaseModelWithOverrides('titleGenerationModel', ...)`
4. Calls `simpleQuery()` with the system + user prompt
5. Returns the trimmed result, or `null` if empty
6. Captures input→output pair as training data (see [Training Capture](#training-capture))

### Where called

- `POST /api/features/create` (`routes/features/routes/create.ts`) — auto-generates title when the incoming feature has an empty title but a description
- `POST /api/features/generate-title` (`routes/features/routes/generate-title.ts`) — standalone endpoint for explicit title generation requests

### Model setting

Uses `titleGenerationModel` from `phaseModels` in settings. Defaults to the fast/nano tier. Configurable via Settings → AI Models.

---

## Branch Name Generator

Two generators exist: a smart (model-based) generator and a deterministic fallback.

### Smart Branch Name Generator

**File:** `apps/server/src/services/branch-name-generator.ts`

**Function:** `createSmartBranchNameGenerator(settingsService, branchPrefixForCategory)`

**Input:** `{ title, description?, category?, featureId? }` + project path  
**Output:** Smart branch name string (e.g. `feature/user-auth-flow-abc1234`), or `null`  
**Throws:** Never — catches all errors and returns `null`

### How it works

1. Checks `workflowSettings.smartBranchNames` — returns `null` if disabled
2. Resolves model via `getPhaseModelWithOverrides('branchNameModel', ...)`
3. Calls `simpleQuery()` with a slug-generation prompt
4. Sanitizes output: lowercase, hyphen-separated, `[a-z0-9-]` only, max 50 chars
5. Returns `{prefix}/{slug}-{shortId}`, or `null` if slug is degenerate (< 3 chars)
6. Captures input→output pair as training data

### Deterministic Fallback

**File:** `apps/server/src/services/feature-loader.ts`

**Method:** `FeatureLoader.generateBranchName(title, featureId?, category?)`

Always produces a branch name. Logic:

1. Derives `shortId` from the last 7 chars of `featureId`
2. Determines prefix from category or conventional-commit type detection in the title (`fix:` → `fix/`, `chore:` → `chore/`, etc.)
3. Slugifies the title (max 50 chars), strips non-`[a-z0-9-]` chars
4. Returns `{prefix}/{slug}-{shortId}`

### Where called

- `FeatureLoader.create()` — during feature creation, after the title is resolved. Tries the smart generator first (if injected), falls back to deterministic.
- `auto-mode/execution-service.ts` — if a feature has no `branchName` at execution time, generates one via `branchNameModel`

### Model setting

Uses `branchNameModel` from `phaseModels` in settings. Defaults to `protolabs/nano`. Configurable via Settings → AI Models. Controlled by `workflowSettings.smartBranchNames` (boolean toggle).

---

## Model Settings

| Setting Key                         | Purpose                             | Default                      | Config Location      |
| ----------------------------------- | ----------------------------------- | ---------------------------- | -------------------- |
| `phaseModels.titleGenerationModel`  | Model for generating feature titles | `protolabs/nano` (fast tier) | Settings → AI Models |
| `phaseModels.branchNameModel`       | Model for generating branch slugs   | `protolabs/nano` (fast tier) | Settings → AI Models |
| `workflowSettings.smartBranchNames` | Enable/disable smart branch names   | `false` (deterministic)      | Settings → Workflow  |

Both `titleGenerationModel` and `branchNameModel` support per-project overrides via `projectSettings.phaseModelOverrides`. Resolution order: project override → global setting → default.

Model resolution uses `getPhaseModelWithOverrides(key, settingsService, projectPath)` from `lib/settings-helpers.ts`.

---

## Where Each Runs

| Generator                  | Entry Point                         | File                                       | Trigger                                               |
| -------------------------- | ----------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| **Title**                  | `POST /api/features/create`         | `routes/features/routes/create.ts`         | Title empty + description present                     |
| **Title**                  | `POST /api/features/generate-title` | `routes/features/routes/generate-title.ts` | Explicit request                                      |
| **Branch (smart)**         | `FeatureLoader.create()`            | `services/branch-name-generator.ts`        | Smart generator injected + `smartBranchNames` enabled |
| **Branch (deterministic)** | `FeatureLoader.create()`            | `services/feature-loader.ts`               | Always (fallback if smart returns null)               |
| **Branch (late)**          | `ExecutionService`                  | `services/auto-mode/execution-service.ts`  | Feature has no `branchName` at execution time         |

All creation paths (UI, CLI, MCP, API, internal) route through `POST /api/features/create`, so naming behavior is identical regardless of source.

---

## Fallbacks

### Title fallback chain

1. If title is provided by caller → use as-is (after quarantine sanitization)
2. If title is empty + description present → call `generateFeatureTitle()`
3. If generation returns `null` (no description, model failure, empty result) → title remains empty string
4. If generation throws → caught by outer `catch` in create handler (returns 500)

### Branch name fallback chain

1. If `branchName` provided by caller and passes validation → use as-is
2. If smart generator is injected AND `smartBranchNames` is enabled → try smart generator
3. If smart generator returns `null` (disabled, no title, model failure, degenerate slug) → use deterministic `generateBranchName()`
4. Deterministic generator always produces a result: `{prefix}/{slug}-{shortId}` or `{prefix}/untitled-{shortId}`
5. Read-only features (`executionMode: 'read-only'`) skip branch generation entirely

---

## Training Capture

Both generators capture input→output pairs for future model distillation (#3859).

**File:** `apps/server/src/services/training-capture.ts`

**Function:** `captureTrainingRow(projectPath, row)`

**Output:** JSONL file at `.automaker/training/{task}/captures.jsonl`

| Task Kind       | Capture Directory                                  | Fields Captured                                                                   |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `feature-title` | `.automaker/training/feature-title/captures.jsonl` | `description` → `title`                                                           |
| `branch-name`   | `.automaker/training/branch-name/captures.jsonl`   | `title`, `description`, `category` → `branchName` (or `<deterministic-fallback>`) |

Capture is **fail-open**: if writing fails, the observed task continues normally. Both generators call `captureTrainingRow` with `void` (fire-and-forget).

---

## Parity Test

**File:** `apps/server/tests/unit/routes/create-naming-parity.test.ts`

Verifies that creating a feature with description-only (no title) yields:

- A **non-empty title** (when the title generator succeeds)
- A **non-empty branch slug** (always, via deterministic or smart generator)

Tests all five feature sources: `ui`, `cli`, `mcp`, `api`, `internal`. Also covers graceful fallback when title generation returns `null` or throws.

---

## Cross-References

- [Providers](./providers) — AI provider abstraction used by `simpleQuery`
- [Route Organization](./route-organization) — Express route structure including `/features/create`
- [Auto Mode Service](./auto-mode-service) — Feature execution lifecycle (includes late branch name generation)
- [Settings Helpers](../../apps/server/src/lib/settings-helpers.ts) — `getPhaseModelWithOverrides` and `getPromptCustomization`
