---
name: setup-tracing
description: Set up Langfuse tracing for Claude Code in the current project. Configures the Stop hook and environment variables so every conversation turn is traced.
category: observability
argument-hint: (optional Langfuse host URL)
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - AskUserQuestion
---

# Setup Langfuse Tracing for Claude Code

You are setting up Langfuse observability tracing for Claude Code in the current project. This traces every conversation turn — user prompts, Claude responses, and tool calls — to a Langfuse instance for analysis and fine-tuning.

## Prerequisites

- Python 3 with `langfuse` package (`pip3 install langfuse`)
- A Langfuse instance (self-hosted or cloud) with API keys

## Process

### 1. Check if tracing is already configured

```bash
cat .claude/settings.json 2>/dev/null | grep -q "langfuse_hook" && echo "ALREADY_CONFIGURED" || echo "NOT_CONFIGURED"
```

If already configured, inform the user and offer to reconfigure.

### 2. Ensure the hook script exists

Check if `~/.claude/hooks/langfuse_hook.py` exists:

```bash
test -f ~/.claude/hooks/langfuse_hook.py && echo "EXISTS" || echo "MISSING"
```

If missing, inform the user:

```
The Langfuse hook script is not installed. Run:
  pip3 install langfuse
  # Then copy langfuse_hook.py to ~/.claude/hooks/
```

### 3. Get Langfuse credentials

If arguments provided a host URL, use it. Otherwise ask:

```
AskUserQuestion:
  header: "Langfuse"
  question: "Where is your Langfuse instance?"
  options:
    - label: "Self-hosted"
      description: "Enter your Langfuse URL (e.g., http://myserver:3001)"
    - label: "Langfuse Cloud (EU)"
      description: "https://cloud.langfuse.com"
    - label: "Langfuse Cloud (US)"
      description: "https://us.cloud.langfuse.com"
```

Then ask for keys:

```
I need your Langfuse API keys. Get them from your Langfuse dashboard → Settings → API Keys.

Paste both keys (public key starts with pk-lf-, secret key starts with sk-lf-).
```

### 4. Add Stop hook to project settings

Read `.claude/settings.json` (create if missing). Add the Stop hook:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/langfuse_hook.py"
          }
        ]
      }
    ]
  }
}
```

If hooks already exist, merge the Stop hook into the existing hooks object. Do NOT overwrite existing hooks.

### 5. Create project-level env config

Determine the project settings path. It follows the pattern:
`~/.claude/projects/-<path-with-dashes>/settings.local.json`

Where the path is the absolute project path with `/` replaced by `-` and leading `-`.

Write `settings.local.json`:

```json
{
  "env": {
    "TRACE_TO_LANGFUSE": "true",
    "LANGFUSE_PUBLIC_KEY": "<public-key>",
    "LANGFUSE_SECRET_KEY": "<secret-key>",
    "LANGFUSE_HOST": "<host-url>",
    "LANGFUSE_BASE_URL": "<host-url>"
  }
}
```

**IMPORTANT:** Both `LANGFUSE_HOST` and `LANGFUSE_BASE_URL` must be set — the SDK reads `LANGFUSE_HOST` but the hook script reads `LANGFUSE_BASE_URL`.

### 6. Test the connection

```bash
LANGFUSE_PUBLIC_KEY="<pk>" LANGFUSE_SECRET_KEY="<sk>" python3 -c "
from langfuse import Langfuse
lf = Langfuse(public_key='<pk>', secret_key='<sk>', host='<host>')
with lf.start_as_current_observation(name='tracing-setup-test', input={'source': 'setup'}) as span:
    span.update(output={'connected': True})
lf.flush()
print('SUCCESS: Trace sent to Langfuse')
lf.shutdown()
"
```

### 7. Report

```
Langfuse tracing configured for this project.

Host: <host-url>
Project settings: .claude/settings.json (Stop hook added)
Env config: ~/.claude/projects/<path>/settings.local.json

Restart Claude Code to activate. Every conversation turn will trace:
- User prompts
- Claude responses
- Tool calls (name, input, output)
- Session grouping by session_id

View traces at: <host-url>
```

## Disabling Tracing

To disable without removing config:

```bash
# In settings.local.json, set:
"TRACE_TO_LANGFUSE": "false"
```

The hook exits immediately when `TRACE_TO_LANGFUSE` is not `"true"`.
