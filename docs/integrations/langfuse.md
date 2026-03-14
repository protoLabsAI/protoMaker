# Langfuse Integration

Connect protoLabs to [Langfuse](https://langfuse.com) for LLM observability, trace inspection, and cost tracking. All tracing is opt-in — the server runs identically when Langfuse credentials are absent.

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

Set these in the project root `.env` file. When any credential is missing, tracing is silently disabled — no errors, no performance impact.

### Verification

After setting the env vars and restarting the server, check the logs for:

```
[LangfuseSingleton] Langfuse singleton initialized (tracing enabled)
```

If credentials are missing you'll see:

```
[LangfuseSingleton] Langfuse singleton initialized (tracing disabled — missing credentials)
```

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

## Available Tools

Five MCP tools expose Langfuse to Claude Code and other MCP clients:

| Tool                      | Description                                               | Required Params            |
| ------------------------- | --------------------------------------------------------- | -------------------------- |
| `langfuse_list_traces`    | List recent traces with filters                           | —                          |
| `langfuse_get_trace`      | Get full trace detail (generations, spans, scores, costs) | `traceId`                  |
| `langfuse_get_costs`      | Get observations for cost analysis                        | —                          |
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

## Troubleshooting

### Tracing Not Active

**Symptom:** No traces appearing in the Langfuse dashboard.

**Solutions:**

- Verify `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set in `.env`
- Restart the server after adding credentials
- Check server logs for `[LangfuseSingleton] ... (tracing enabled)` confirmation

## Related Documentation

- [Prompt Engineering](../concepts/prompt-engineering.md) — How prompts are composed and customized
