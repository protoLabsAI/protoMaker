# Tracing

All LLM calls in protoLabs Studio are traced via Langfuse when configured. Tracing is transparent — the application behaves identically whether Langfuse is available or not.

## What Gets Traced

Every call through the provider layer (`simpleQuery`, `streamingQuery`, or direct `TracedProvider.executeQuery`) creates a Langfuse trace with:

- **Model** and token usage (input, output, total)
- **Cost** calculated from configurable per-model pricing
- **Tags** for filtering: `feature:{id}`, `role:{agentRole}`, `project:{slug}`, `phase:{phase}`
- **Metadata** including feature ID, feature name, project slug, and phase
- **Errors** with stack traces when the provider call fails

## Session Grouping

Traces are grouped into Langfuse sessions for timeline and cost aggregation.

### Project Sessions

When a trace originates from a project lifecycle phase, it is assigned to session `project:{slug}`. All phases of the same project share one session:

```
Session: project:ci-reaction-engine
  Trace [phase:research]  — codebase analysis
  Trace [phase:prd]       — SPARC PRD generation
  Trace [phase:execute]   — agent implementation (per feature)
  Trace [phase:deploy]    — post-merge verification + reflection
```

Filter the Langfuse Sessions tab by session ID to see the full project lifecycle with cumulative cost.

### Feature Traces Without a Project

Features that are not part of a project (no `projectSlug`) fall back to the SDK-provided session ID, or no session at all. They are still individually traceable by the `feature:{id}` tag.

## Phase Tags

| Tag              | When Applied                                           |
| ---------------- | ------------------------------------------------------ |
| `phase:research` | Deep research session for a project                    |
| `phase:prd`      | SPARC PRD generation                                   |
| `phase:execute`  | Agent implementation of a feature                      |
| `phase:deploy`   | Post-merge verification, goal checking, and reflection |

## Configuration

Tracing is enabled when Langfuse environment variables are set:

| Variable              | Required | Description              |
| --------------------- | -------- | ------------------------ |
| `LANGFUSE_PUBLIC_KEY` | Yes      | Langfuse public key      |
| `LANGFUSE_SECRET_KEY` | Yes      | Langfuse secret key      |
| `LANGFUSE_BASE_URL`   | No       | API URL (default: cloud) |

When these variables are absent, all tracing calls silently no-op.

## Graceful Fallback

The tracing layer never blocks or fails the primary operation. If Langfuse is unavailable:

- `wrapProviderWithTracing` passes the generator through unmodified
- `createTrace`, `createGeneration`, and `createScore` return `null`
- No errors are thrown or logged beyond initial connection warnings
