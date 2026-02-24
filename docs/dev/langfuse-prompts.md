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

## GitHub Sync

Automatically sync Langfuse prompts to a GitHub repository for version control and CI/CD workflows.

### Setup

**Required Environment Variables:**

```bash
# Langfuse credentials (required for prompt management)
LANGFUSE_PUBLIC_KEY=pk_...
LANGFUSE_SECRET_KEY=sk_...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # optional, defaults to cloud

# GitHub sync (required for automatic syncing)
GITHUB_TOKEN=ghp_...           # Personal Access Token with repo scope
GITHUB_REPO_OWNER=owner        # Repository owner/organization
GITHUB_REPO_NAME=repo-name     # Repository name

# Optional sync configuration
LANGFUSE_WEBHOOK_SECRET=whsec_...   # HMAC secret for webhook verification
LANGFUSE_SYNC_LABEL=production      # Prompt label filter (default: production)
LANGFUSE_SYNC_CI_TRIGGER=true       # Enable repository_dispatch after sync
```

**GitHub Token Permissions:**

Your `GITHUB_TOKEN` must have the following permissions:

- `repo` scope (full control of private repositories)
  - Required for: reading files, creating commits, pushing to branches
- For organization repositories: ensure the token has access to the organization

**File Structure:**

Prompts are synced to the repository following this structure:

```text
prompts/
├── autoMode/
│   ├── planningLite.txt
│   ├── planningLiteWithApproval.txt
│   ├── planningSpec.txt
│   └── ...
├── agent/
│   └── systemPrompt.txt
├── backlogPlan/
│   ├── systemPrompt.txt
│   └── userPromptTemplate.txt
├── enhancement/
│   ├── improveSystemPrompt.txt
│   └── ...
└── [category]/
    └── [key].txt
```

Each file contains the raw prompt text for that specific prompt key.

### Langfuse Webhook Configuration

Configure webhooks in your Langfuse dashboard to trigger automatic syncs when prompts are updated:

1. **Navigate to Project Settings**
   - Open your Langfuse project
   - Go to **Settings** → **Webhooks**

2. **Create New Webhook**
   - Click **Add Webhook**
   - Set the **Endpoint URL** to your server's webhook endpoint:
     ```
     https://your-server.com/api/langfuse/webhook/prompt
     ```
   - Select event types to trigger on:
     - `prompt.created`
     - `prompt.updated`
     - `prompt.deleted`

3. **Configure Authentication** (optional but recommended)
   - Add a webhook secret for request verification
   - Store the secret in your environment as `LANGFUSE_WEBHOOK_SECRET`

4. **Test the Webhook**
   - Use the Langfuse dashboard's "Test" button to send a sample event
   - Verify your server receives and processes the webhook correctly

5. **Activate the Webhook**
   - Enable the webhook to start receiving events
   - Monitor logs to ensure events are processed successfully

### CI/CD Integration

When `LANGFUSE_SYNC_CI_TRIGGER=true` is set, the `PromptCITriggerService` fires a GitHub `repository_dispatch` event after each prompt commit. This allows downstream CI workflows to react to prompt changes (e.g., redeploying services, running prompt validation).

The dispatch event type is `langfuse-prompt-sync` and includes the prompt name, version, and category in the payload.

### Troubleshooting

#### Webhook Events Not Received

**Symptoms:** Langfuse prompts are updated but no commits appear in GitHub.

**Solutions:**

- Verify webhook endpoint is publicly accessible
- Check Langfuse webhook logs for delivery failures
- Ensure `GITHUB_TOKEN` has not expired
- Verify server logs for webhook processing errors
- Test webhook manually using Langfuse dashboard's "Test" button

#### GitHub Push Failures

**Symptoms:** Webhook received but commit fails with authentication or permission errors.

**Solutions:**

- Verify `GITHUB_TOKEN` has `repo` scope
- Check token hasn't been revoked or expired
- Verify `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` are set correctly
- Verify branch exists and token has write access
- Check for branch protection rules that may block commits

#### Prompt Sync Conflicts

**Symptoms:** Multiple versions of the same prompt, or unexpected prompt content.

**Solutions:**

- Ensure only one sync mechanism is active (webhook OR manual seed script)
- Check for concurrent webhook processing (use queue if needed)
- Verify `production` label is applied to correct prompt version
- Review commit history to identify source of conflicting changes
- Re-run seed script to reset to known state: `npx tsx scripts/seed-langfuse-prompts.ts`

#### Missing Prompts After Sync

**Symptoms:** Some prompts don't appear in GitHub or Langfuse after syncing.

**Solutions:**

- Verify prompt naming follows `{category}.{key}` convention
- Check Langfuse dashboard for prompts with `production` label
- Review sync script logs for errors or skipped prompts
- Ensure file structure matches expected pattern: `prompts/{category}/{key}.txt`
- Check file permissions in GitHub repository

#### CI/CD Workflow Failures

**Symptoms:** GitHub Actions workflow fails during prompt validation or sync.

**Solutions:**

- Check GitHub Actions logs for specific error messages
- Verify all required secrets are configured correctly
- Ensure Node.js version matches project requirements
- Test validation script locally: `npx tsx scripts/validate-prompts.ts`
- Verify `npm ci` completes successfully (check package-lock.json)
- Review prompt file format (must be plain text `.txt` files)

## Files

| File                                                     | Purpose                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/server/src/services/prompt-resolver.ts`            | Three-layer resolution service                               |
| `apps/server/src/lib/settings-helpers.ts`                | `getPromptCustomization()` — auto-discovers PromptResolver   |
| `apps/server/src/lib/langfuse-singleton.ts`              | Singleton factory for LangfuseClient and PromptResolver      |
| `apps/server/src/lib/langfuse-webhook.ts`                | Webhook types and HMAC-SHA256 signature verification         |
| `apps/server/src/routes/langfuse/webhook.ts`             | Webhook route handler — filters by label, dispatches to sync |
| `apps/server/src/services/prompt-github-sync-service.ts` | Octokit-based GitHub sync (commit prompts to `prompts/`)     |
| `apps/server/src/services/prompt-ci-trigger-service.ts`  | `repository_dispatch` trigger after prompt commits           |
| `libs/observability/src/langfuse/client.ts`              | `LangfuseClient.getPrompt()` with label support              |
| `libs/observability/src/langfuse/cache.ts`               | `PromptCache` for TTL-based caching                          |
| `libs/observability/src/langfuse/versioning.ts`          | `getRawPrompt()`, `prefetchPrompts()`, label/version pinning |
| `scripts/seed-langfuse-prompts.ts`                       | One-time script to push all prompts to Langfuse              |

## Related Documentation

- [Langfuse Integration](./langfuse-integration.md) — Server-side tracing, agent scoring, API proxy routes
- [Observability Package](./observability-package.md) — `@automaker/observability` library reference
- [Prompt Engineering](../agents/prompt-engineering.md) — How prompts are composed and customized
