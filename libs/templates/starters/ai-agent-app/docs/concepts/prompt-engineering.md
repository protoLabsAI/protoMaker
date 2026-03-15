# Prompt engineering

This page explains how the starter kit manages prompts and how to write effective system prompts for your agent.

## How prompts work

The starter kit has three layers of prompt control:

1. **System prompt** — sent with every request, defines the agent's role and capabilities
2. **Slash commands** — user-triggered expansions that prepend instructions to the system prompt
3. **Prompt templates** — git-versioned markdown files with variable substitution, managed through the prompt registry

## System prompts

Every request to `POST /api/chat` can include a `system` field. The UI sends this from the active agent role.

```typescript
// packages/app/src/routes/index.tsx
const { messages } = useChat({
  api: '/api/chat',
  body: {
    model: 'claude-sonnet-4-5',
    system: 'You are a helpful coding assistant. Be concise.',
  },
});
```

The server appends any active slash command expansion to the front of this string:

```
[slash command expansion]\n\n[system prompt]
```

The expansion comes first so it takes precedence over the base system instructions.

## Agent roles

Agent roles are named system prompt presets. Register a role in `packages/server/src/roles/`:

```typescript
// packages/server/src/roles/code-reviewer.ts
import { registerRole } from './index.js';

registerRole({
  id: 'code-reviewer',
  name: 'Code Reviewer',
  systemPrompt: `You are an expert code reviewer. When reviewing code:
- Identify correctness issues before style issues
- Suggest specific improvements, not vague feedback
- Point out security vulnerabilities explicitly
- Acknowledge what is done well`,
  defaultModel: 'claude-sonnet-4-5',
});
```

The UI exposes a role selector. When the user switches roles, the role's `systemPrompt` replaces the current system prompt and the `defaultModel` pre-selects the recommended model.

Retrieve all roles via `GET /api/roles`. Retrieve a specific role via `GET /api/roles/:id`.

## Slash commands

Slash commands let users dynamically expand the system prompt at runtime without editing configuration.

### Writing a command

Create a file in `packages/server/src/commands/` and register it:

```typescript
// packages/server/src/commands/explain.ts
import { registerCommand } from './index.js';

registerCommand({
  name: 'explain',
  description: 'Explain the following topic in plain English',
  expand: (args) =>
    `Explain the following in plain English. Avoid jargon. Use short paragraphs and concrete examples.
Topic: ${args}`,
});
```

Import the file in `packages/server/src/routes/chat.ts` to register it as a side effect:

```typescript
import '../commands/explain.js';
```

### Using a command

Users type the command name with a leading `/`:

```
/explain closures in JavaScript
```

The server detects the slash prefix, calls `expand()`, and prepends the result to the system prompt. The user message in the conversation history is unchanged — only the model sees the expanded instructions.

### Built-in commands

| Command         | What it does                                   |
| --------------- | ---------------------------------------------- |
| `/summarize`    | Asks the model to summarize the following text |
| `/eli5 [topic]` | Explain like I'm 5 — simple, no jargon         |
| `/bullets`      | Respond with a concise bullet-point list       |

## Prompt templates

The prompt registry stores system prompts as markdown files with YAML frontmatter. This keeps prompts version-controlled alongside code.

### Template format

```markdown
---
id: research-assistant
name: Research Assistant
description: Systematic information gathering
model: claude-sonnet-4-5
version: 1.0.0
variables:
  - topic
  - depth
---

You are a research assistant specializing in {{topic}}.

Depth of analysis: {{depth}}

Structure your responses with:

1. Key facts (with sources)
2. Open questions
3. Recommended next steps
```

### Registering and using templates

```typescript
import { PromptRegistry, PromptLoader } from '@@PROJECT_NAME-prompts';

const registry = new PromptRegistry();
const loader = new PromptLoader(registry);

// Load all templates from a directory
await loader.loadFromDirectory('./prompts');

// Retrieve a template
const prompt = registry.get('research-assistant');

// Render with variables
const rendered = registry.createPromptFromTemplate('research-assistant', {
  topic: 'quantum computing',
  depth: 'introductory',
});
```

Unrecognized `{{placeholders}}` are preserved as-is rather than being removed — this makes it easy to spot missing variables during testing.

### Editing prompts in the UI

The prompt editor at `/prompts` lets you browse, edit, and test templates directly. Changes save to disk automatically, keeping the git history intact.

## Writing effective system prompts

### Be explicit about output format

```
# Good
Return your analysis as JSON with this shape:
{ "issues": [{ "line": number, "severity": "error"|"warning", "message": string }] }

# Vague
Return structured output
```

### Separate persona from instructions

```
# Persona (who the agent is)
You are a senior software architect with 15 years of experience in distributed systems.

# Instructions (what to do)
When reviewing architecture:
- Identify single points of failure
- Assess scalability at 10x current load
- Flag missing observability
```

### Use few-shot examples for consistency

```
When formatting a PR review comment, use this format:

**Issue**: [one sentence description]
**File**: `path/to/file.ts` line 42
**Suggestion**: [specific fix]

Example:
**Issue**: Missing null check before accessing user.address
**File**: `src/user-service.ts` line 87
**Suggestion**: Add `if (!user?.address) return null;` before line 87
```

### Constrain the failure mode

Tell the model what to do when it doesn't know the answer, rather than leaving it to improvise:

```
If you do not have enough information to answer, respond with:
"I need more context about [specific missing detail]. Please provide [X]."

Do not guess or speculate when information is missing.
```

## Prompt testing

Use the prompt playground at `/prompts` to:

1. Select a template from the registry
2. Fill in variable values
3. Send test messages and evaluate the response quality
4. Iterate on the template without restarting the server

See [Prompt playground](../guides/prompt-playground.md) for the full workflow.
