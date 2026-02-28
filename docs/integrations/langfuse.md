# Langfuse Integration

Connect protoLabs to [Langfuse](https://langfuse.com) for LLM observability, trace inspection, and managed prompt versioning. All tracing is opt-in — the server runs identically when Langfuse credentials are absent.

## Prerequisites

- A Langfuse account ([cloud.langfuse.com](https://cloud.langfuse.com) or self-hosted)
- Langfuse project with a public key and secret key

## Setup

### Environment Variables

| Variable              | Required | Default                      | Description                             |
| --------------------- | -------- | ---------------------------- | --------------------------------------- |
| `LANGFUSE_PUBLIC_KEY` | No       | —                            | Langfuse public key                     |
| `LANGFUSE_SECRET_KEY` | No       | —                            | Langfuse secret key                     |
| `LANGFUSE_BASE_URL`   | No       | `https://cloud.langfuse.com` | Langfuse API URL (self-hosted or cloud) |

Set these in the project root `.env` file. When any credential is missing, tracing and prompt management are silently disabled — no errors, no performance impact.

### Verification

After setting the env vars and restarting the server, check the logs for:

```
[LangfuseSingleton] Langfuse singleton initialized (tracing enabled)
```

If credentials are missing you'll see:

```
[LangfuseSingleton] Langfuse singleton initialized (tracing disabled — missing credentials)
```

## Configuration

### Prompt Seeding

Push default prompt baselines to Langfuse to enable version tracking and A/B experiments:

**Via MCP Tool (Recommended)**

```
langfuse_seed_prompts({ labels: ["production"], force: false })
```

**Via API**

```bash
curl -X POST http://localhost:3008/api/langfuse/prompts/seed \
  -H "Content-Type: application/json" \
  -d '{"labels": ["production"], "force": false}'
```

- `labels`: Langfuse labels to apply (default: `["production"]`)
- `force`: If `false` (default), skips prompts that already exist. If `true`, creates a new version.

### GitHub Sync (Optional)

Automatically sync Langfuse prompts to a GitHub repository for version control and CI/CD workflows.

**Additional environment variables required:**

```bash
GITHUB_TOKEN=ghp_...              # Personal Access Token with repo scope
GITHUB_REPO_OWNER=owner           # Repository owner/organization
GITHUB_REPO_NAME=repo-name        # Repository name
LANGFUSE_WEBHOOK_SECRET=whsec_... # HMAC secret for webhook verification (optional)
LANGFUSE_SYNC_LABEL=production    # Prompt label filter (default: production)
LANGFUSE_SYNC_CI_TRIGGER=true     # Enable repository_dispatch after sync (optional)
```

**Langfuse Webhook Setup:**

1. Open your Langfuse project → **Settings** → **Webhooks** → **Add Webhook**
2. Set endpoint URL to: `https://your-server.com/api/langfuse/webhook/prompt`
3. Select event types: `prompt.created`, `prompt.updated`, `prompt.deleted`
4. Add `LANGFUSE_WEBHOOK_SECRET` for HMAC verification (optional but recommended)
5. Enable the webhook

When `LANGFUSE_SYNC_CI_TRIGGER=true`, a `repository_dispatch` event (`langfuse-prompt-sync`) fires after each prompt commit, allowing downstream CI workflows to react to prompt changes.

## What It Does

### Tracing

Every LLM call during agent execution is automatically traced in Langfuse when credentials are configured. Each trace includes:

- Model name, token usage, latency, and cost
- Feature ID and agent role as filterable tags (e.g., `feature:abc-123`, `role:backend-engineer`)
- Agent SDK session ID for conversation correlation

Two independent tracing paths coexist:

| Track           | Covers                        | Source            |
| --------------- | ----------------------------- | ----------------- |
| **SDK Wrapper** | Agent runs (Claude Agent SDK) | TracedProvider    |
| **OTEL**        | Chat UI (`/api/chat`)         | Auto-instrumented |

Agents and chat produce separate traces with different structures but both land in the same Langfuse project. There is no double-counting risk.

**Filtering by feature or role:**

```bash
# All traces for a specific feature
langfuse_list_traces --tags '["feature:abc-123"]'

# Reflection traces only
langfuse_list_traces --tags '["role:reflection"]'

# Reflections for a specific feature
langfuse_list_traces --tags '["feature:abc-123", "role:reflection"]'
```

### Agent Scoring

Agent traces are automatically scored when feature status changes:

| Score              | Range   | Description                            |
| ------------------ | ------- | -------------------------------------- |
| `agent.success`    | 0.0–1.0 | 1.0 = done, 0.7 = review, 0.0 = failed |
| `agent.efficiency` | 0.0–1.0 | 1 - (turnsUsed / maxTurns)             |
| `agent.quality`    | 0.0–1.0 | 1 - (reviewThreads × 0.1)              |

Use these scores in Langfuse to compare prompt versions and identify regressions.

### Prompt Management

All prompts flow through a three-layer resolution system:

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

- **Zero-config**: Works automatically when credentials are set. Falls through to defaults otherwise.
- **Graceful degradation**: Langfuse failures are caught silently — no errors, no added latency.
- **User overrides always win**: Settings-based customization (Layer 1) takes priority over Langfuse.
- **Cached**: Langfuse prompts are cached for 5 minutes.

Prompts use hierarchical dot-notation: `{category}.{key}`

**A/B experiments and rollout:**

1. **Create variant**: Edit a prompt in Langfuse to create a new version
2. **Label for testing**: Apply `staging` label to the new version
3. **Test**: Configure a staging server with `LANGFUSE_SYNC_LABEL=staging`
4. **Promote**: Move the `production` label to the winning version
5. **Monitor**: Compare agent scores in Langfuse across prompt versions

## Available Tools

Seven MCP tools expose Langfuse to Claude Code and other MCP clients:

| Tool                      | Description                                               | Required Params            |
| ------------------------- | --------------------------------------------------------- | -------------------------- |
| `langfuse_list_traces`    | List recent traces with filters                           | —                          |
| `langfuse_get_trace`      | Get full trace detail (generations, spans, scores, costs) | `traceId`                  |
| `langfuse_get_costs`      | Get observations for cost analysis                        | —                          |
| `langfuse_list_prompts`   | List managed prompts with versions/labels                 | —                          |
| `langfuse_score_trace`    | Score a trace (name, value 0–1, optional comment)         | `traceId`, `name`, `value` |
| `langfuse_list_datasets`  | List datasets with item counts                            | —                          |
| `langfuse_add_to_dataset` | Add a trace to a named dataset (creates if missing)       | `datasetName`, `traceId`   |

### Example Usage

```bash
# List recent traces for a feature
langfuse_list_traces --tags '["feature:abc-123"]' --limit 10

# Get detailed trace info
langfuse_get_trace --traceId "trace-uuid-here"

# Manually score agent output quality
langfuse_score_trace --traceId "trace-uuid" --name "quality" --value 0.9 --comment "Clean implementation"

# Add a good trace to a training dataset
langfuse_add_to_dataset --datasetName "good-implementations" --traceId "trace-uuid"
```

Langfuse also provides a native MCP server at `{LANGFUSE_BASE_URL}/api/public/mcp` with prompt management tools: `getPrompt`, `listPrompts`, `createTextPrompt`, `createChatPrompt`, `updatePromptLabels`.

## Troubleshooting

### Tracing Not Active

**Symptom:** No traces appearing in the Langfuse dashboard.

**Solutions:**

- Verify `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set in `.env`
- Restart the server after adding credentials
- Check server logs for `[LangfuseSingleton] ... (tracing enabled)` confirmation

### Prompt Not Found Errors

**Symptom:** `console.error` logs from the Langfuse SDK about missing prompts.

**Solutions:**

- Seed prompts using the `langfuse_seed_prompts` MCP tool or the API endpoint above
- This is a known Langfuse SDK limitation — seeding eliminates these errors

### Webhook Events Not Received

**Symptom:** Prompts updated in Langfuse but no commits appear in GitHub.

**Solutions:**

- Verify the webhook endpoint is publicly accessible
- Check Langfuse webhook logs for delivery failures
- Ensure `GITHUB_TOKEN` has not expired and has `repo` scope
- Test the webhook using the Langfuse dashboard's "Test" button

### GitHub Push Failures

**Symptom:** Webhook received but commit fails with authentication or permission errors.

**Solutions:**

- Verify `GITHUB_TOKEN` has `repo` scope and hasn't been revoked
- Check that `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` are set correctly
- Verify the branch exists and the token has write access
- Check for branch protection rules that may block commits

### Prompt Sync Conflicts

**Symptom:** Multiple versions of the same prompt, or unexpected prompt content.

**Solutions:**

- Ensure only one sync mechanism is active (webhook OR manual seed script)
- Verify the `production` label is applied to the correct prompt version
- Review commit history to identify the source of conflicting changes

## Related Documentation

- [Observability Package](../dev/observability-package.md) — `@protolabs-ai/observability` library internals (contributor reference)
- [Providers](../server/providers.md) — AI provider architecture
- [Prompt Engineering](../agents/prompt-engineering.md) — How prompts are composed and customized
