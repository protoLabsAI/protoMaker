# Langfuse Prompt Management

Centralized prompt versioning and management via [Langfuse](https://langfuse.com). All ~100 prompts across 12 categories flow through a three-layer resolution system. Complements the [Langfuse Integration](./langfuse-integration.md) (tracing/scoring) doc.

## Three-Layer Resolution

```text
Request for prompt "autoMode.planningLite"
  │
  ├─ Layer 1: User Override (settings.json promptCustomization)
  │   └─ If user has enabled custom prompt → use it
  │
  ├─ Layer 2: Langfuse Managed Prompt (label: "production")
  │   └─ If Langfuse available + prompt exists → use it
  │
  └─ Layer 3: Hardcoded Default (libs/prompts/defaults.ts)
      └─ Always available as fallback
```

**Key properties:**

- **Zero-config**: Works automatically when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set. Falls through to defaults otherwise.
- **Graceful degradation**: Langfuse failures are caught silently — no errors, no added latency.
- **User overrides always win**: Settings-based customization (Layer 1) takes priority over Langfuse.
- **Cached**: Langfuse prompts are cached for 5 minutes via `PromptCache`.
- **No callsite changes**: The `getPromptCustomization()` function auto-discovers the PromptResolver singleton.

## Architecture

```text
┌─────────────────────────────────────────────────┐
│  getPromptCustomization()                        │
│  (apps/server/src/lib/settings-helpers.ts)       │
│                                                  │
│  1. Load user customization from settings        │
│  2. Merge with hardcoded defaults (merge.ts)     │
│  3. Overlay Langfuse prompts for non-overridden  │
│     keys (PromptResolver)                        │
└───────┬──────────────────────────────────────────┘
        │ uses
┌───────▼──────────────────────────────────────────┐
│  PromptResolver                                   │
│  (apps/server/src/services/prompt-resolver.ts)    │
│                                                   │
│  resolve(name, default, userOverride?)             │
│  resolveCategory(category, defaults, overrides?)   │
│                                                   │
│  Uses:                                            │
│  - LangfuseClient.getPrompt(name, v, {label})     │
│  - PromptCache (5min TTL, 200 entries)             │
└───────┬──────────────────────────────────────────┘
        │ singleton via
┌───────▼──────────────────────────────────────────┐
│  langfuse-singleton.ts                            │
│  getPromptResolver()                              │
│  getLangfuseInstance()                             │
└──────────────────────────────────────────────────┘
```

## Prompt Naming Convention

All prompts use hierarchical dot-notation: `{category}.{key}`

| Category             | Keys                                                                                                                                                                                                                                                                                                    | Source                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `autoMode`           | `planningLite`, `planningLiteWithApproval`, `planningSpec`, `planningFull`, `featurePromptTemplate`, `followUpPromptTemplate`, `continuationPromptTemplate`, `pipelineStepPromptTemplate`                                                                                                               | `libs/prompts/defaults.ts`    |
| `agent`              | `systemPrompt`                                                                                                                                                                                                                                                                                          | `libs/prompts/defaults.ts`    |
| `backlogPlan`        | `systemPrompt`, `userPromptTemplate`                                                                                                                                                                                                                                                                    | `libs/prompts/defaults.ts`    |
| `enhancement`        | `improveSystemPrompt`, `technicalSystemPrompt`, `simplifySystemPrompt`, `acceptanceSystemPrompt`, `uxReviewerSystemPrompt`                                                                                                                                                                              | `libs/prompts/enhancement.ts` |
| `commitMessage`      | `systemPrompt`                                                                                                                                                                                                                                                                                          | `libs/prompts/defaults.ts`    |
| `titleGeneration`    | `systemPrompt`                                                                                                                                                                                                                                                                                          | `libs/prompts/defaults.ts`    |
| `issueValidation`    | `systemPrompt`                                                                                                                                                                                                                                                                                          | `libs/prompts/defaults.ts`    |
| `ideation`           | `ideationSystemPrompt`, `suggestionsSystemPrompt`                                                                                                                                                                                                                                                       | `libs/prompts/defaults.ts`    |
| `appSpec`            | `generateSpecSystemPrompt`, `structuredSpecInstructions`, `generateFeaturesFromSpecPrompt`                                                                                                                                                                                                              | `libs/prompts/defaults.ts`    |
| `contextDescription` | `describeFilePrompt`, `describeImagePrompt`                                                                                                                                                                                                                                                             | `libs/prompts/defaults.ts`    |
| `suggestions`        | `featuresPrompt`, `refactoringPrompt`, `securityPrompt`, `performancePrompt`, `baseTemplate`                                                                                                                                                                                                            | `libs/prompts/defaults.ts`    |
| `taskExecution`      | `taskPromptTemplate`, `implementationInstructions`, `playwrightVerificationInstructions`, `learningExtractionSystemPrompt`, `learningExtractionUserPromptTemplate`, `planRevisionTemplate`, `continuationAfterApprovalTemplate`, `resumeFeatureTemplate`, `projectAnalysisPrompt`, `prFeedbackTemplate` | `libs/prompts/defaults.ts`    |

## Seed Script

Push all hardcoded prompts to Langfuse:

```bash
npx tsx scripts/seed-langfuse-prompts.ts
```

**Requirements:**

- `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` in your `.env`
- `LANGFUSE_BASE_URL` (optional, defaults to `https://cloud.langfuse.com`)

**Behavior:**

- Creates each prompt with the `production` label
- Idempotent: re-running creates new versions of existing prompts
- Reports which prompts succeeded/failed

## Managing Prompts in Langfuse

### Via Langfuse Dashboard

1. Navigate to **Prompts** in your Langfuse project
2. Find the prompt by name (e.g., `autoMode.planningLite`)
3. Edit the prompt text and save (creates a new version)
4. Apply the `production` label to make it active

### Via Langfuse MCP Server

Langfuse provides a native MCP server at `{LANGFUSE_BASE_URL}/api/public/mcp` with tools:

- `getPrompt` — fetch prompt by name/version/label
- `listPrompts` — list all managed prompts
- `createTextPrompt` / `createChatPrompt` — create new prompts
- `updatePromptLabels` — promote/demote labels (e.g., staging → production)

### Promoting Prompts

Use Langfuse labels for environment management:

```text
staging  → Test changes before production
production → Active in all server instances
```

The PromptResolver fetches prompts with `label: "production"` by default. To test a change:

1. Create a new version of the prompt in Langfuse
2. Apply the `staging` label
3. Verify in a staging environment
4. Move the `production` label to the new version

## Disabling Langfuse Layer

To run without the Langfuse prompt layer:

- **Remove credentials**: Unset `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` — the resolver detects Langfuse is unavailable and skips it entirely.
- **Per-call**: Pass `null` as the third argument to `getPromptCustomization()`:
  ```typescript
  const prompts = await getPromptCustomization(settingsService, '[MyService]', null);
  ```

## Files

| File                                            | Purpose                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `apps/server/src/services/prompt-resolver.ts`   | Three-layer resolution service                               |
| `apps/server/src/lib/settings-helpers.ts`       | `getPromptCustomization()` — auto-discovers PromptResolver   |
| `apps/server/src/lib/langfuse-singleton.ts`     | Singleton factory for LangfuseClient and PromptResolver      |
| `libs/observability/src/langfuse/client.ts`     | `LangfuseClient.getPrompt()` with label support              |
| `libs/observability/src/langfuse/cache.ts`      | `PromptCache` for TTL-based caching                          |
| `libs/observability/src/langfuse/versioning.ts` | `getRawPrompt()`, `prefetchPrompts()`, label/version pinning |
| `scripts/seed-langfuse-prompts.ts`              | One-time script to push all prompts to Langfuse              |
