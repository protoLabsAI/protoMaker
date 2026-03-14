# Agent Manifests

Agent manifests let you define custom AI agents at the project level. Each agent extends a built-in role with custom model selection, prompt files, and auto-assignment rules. Manifests are YAML files stored in `.automaker/agents/`.

## Quick Start

Create `.automaker/agents.yml` in your project:

```yaml
version: '1'
agents:
  - name: react-specialist
    extends: frontend-engineer
    description: Expert in React component architecture and hooks
    model: claude-opus-4-6
    promptFile: .automaker/agents/prompts/react.md
    match:
      categories:
        - frontend
        - ui
      keywords:
        - react
        - component
        - tsx
      filePatterns:
        - 'apps/ui/src/**/*.tsx'
```

When a feature matches these rules, the system auto-assigns this agent, uses the specified model, and injects the custom prompt.

## Manifest Format

### File Locations

Two layouts are supported:

**Single file** --- `.automaker/agents.yml`:

```yaml
version: '1'
agents:
  - name: api-specialist
    extends: backend-engineer
    # ...
  - name: react-specialist
    extends: frontend-engineer
    # ...
```

**Directory** --- `.automaker/agents/*.yml` (one agent per file):

```
.automaker/agents/
  api-specialist.yml
  react-specialist.yml
```

Each file can contain:

- A full manifest object (`{ version, agents: [...] }`)
- A bare array of agents (`[{ name, extends, ... }]`)
- A single agent object (`{ name, extends, ... }`)

If both `.automaker/agents.yml` and the directory exist, the single file takes precedence.

> **Note:** Manifest file locations are fixed — there is no `manifestPaths` setting to configure custom lookup paths.

### Agent Fields

| Field          | Type   | Required | Description                                                    |
| -------------- | ------ | -------- | -------------------------------------------------------------- |
| `name`         | string | Yes      | Unique identifier (e.g., `react-specialist`)                   |
| `extends`      | string | Yes      | Built-in role to inherit from                                  |
| `description`  | string | No       | What this agent specializes in (defaults to empty string)      |
| `model`        | string | No       | Model override (e.g., `claude-opus-4-6`, `claude-sonnet-4-6`)  |
| `promptFile`   | string | No       | Path to custom prompt file, relative to project root           |
| `capabilities` | object | No       | Override inherited capabilities (tools, maxTurns, permissions) |
| `match`        | object | No       | Auto-assignment rules                                          |

### Match Rules

Match rules control automatic agent assignment when a feature is picked up for execution.

```yaml
match:
  categories: # Exact match against feature.category
    - frontend
    - ui
  keywords: # Searched in feature title + description
    - react
    - component
    - hooks
  filePatterns: # Glob patterns against feature.filesToModify
    - 'apps/ui/**/*.tsx'
    - '**/*.css'
```

All three fields use **OR semantics** --- a match in any field contributes to the score. The scoring system:

| Match Type   | Points Per Match |
| ------------ | ---------------- |
| Category     | +10              |
| Keyword      | +5               |
| File pattern | +3               |

The agent with the highest total score wins. Agents with zero matches are skipped.

### Capabilities

Override the base role's capabilities selectively:

```yaml
capabilities:
  maxTurns: 200
  tools:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
  canUseBash: true
  canModifyFiles: true
  canCommit: true
  canCreatePRs: true
```

Unspecified fields inherit from the base role defined in `extends`.

## Built-in Roles

These roles are always available and serve as base types for custom agents:

| Role                  | Description                             |
| --------------------- | --------------------------------------- |
| `product-manager`     | Research, PRD creation, feature scoping |
| `engineering-manager` | Feature breakdown, release management   |
| `frontend-engineer`   | React/UI implementation                 |
| `backend-engineer`    | APIs, databases, services               |
| `devops-engineer`     | CI/CD, infrastructure                   |
| `qa-engineer`         | Testing, PR review                      |
| `docs-engineer`       | Documentation, changelogs               |
| `gtm-specialist`      | Marketing, content strategy             |

## How Auto-Assignment Works

When auto-mode picks up a feature for execution, the system runs this flow:

1. **Skip if manually assigned** --- If `feature.assignedRole` is already set, respect it
2. **Skip if disabled** --- If `agentConfig.autoAssignEnabled` is `false` in project settings
3. **Run match rules** --- Score all project agents against the feature
4. **Assign best match** --- Set `assignedRole` and record a `routingSuggestion` with confidence and reasoning
5. **Proceed to execution** --- `getModelForFeature()` picks up the role's model override

Auto-assignment is non-fatal. If matching fails or no agents match, the feature executes with default settings.

## Model Resolution Priority

When determining which model to use for a feature, the system checks in order:

1. Explicit `feature.model` override (set manually per-feature)
2. Failure escalation (2+ failures escalate to opus)
3. Architectural complexity (always uses opus)
4. **Agent manifest model** --- `agent.model` from the matched manifest entry
5. **Settings model override** --- `agentConfig.roleModelOverrides[role]` from `.automaker/settings.json`
6. `phaseModels.agentExecutionModel` from workflow settings
7. Complexity fallback (small = haiku, medium/large = sonnet)

Manifest model (step 4) takes precedence over settings override (step 5), but settings let users override manifest defaults without editing YAML.

## Prompt Injection

When a feature has an assigned role with a `promptFile`, the assembled system prompt follows this order:

```markdown
## Agent Role: react-specialist

Expert in React component architecture and hooks

{contents of .automaker/agents/prompts/react.md}

---

{context files from .automaker/context/}
{memory from .automaker/memory/}
```

The role prompt (header + `promptFile` contents) is injected first, followed by context and memory files.

If the prompt file is missing, a warning is logged and execution continues normally.

## Project Settings

Configure agent behavior in `.automaker/settings.json`:

```json
{
  "agentConfig": {
    "autoAssignEnabled": true,
    "roleModelOverrides": {
      "react-specialist": { "model": "claude-opus-4-6" },
      "api-specialist": { "model": "claude-sonnet-4-6" }
    }
  }
}
```

| Setting              | Default | Description                                               |
| -------------------- | ------- | --------------------------------------------------------- |
| `autoAssignEnabled`  | `true`  | Enable/disable match rule auto-assignment                 |
| `roleModelOverrides` | `{}`    | Per-role model overrides (settings-level, below manifest) |

## API Reference

### POST /api/agents/list

Returns all agents (built-in + project-defined) for a project.

**Request:**

```json
{ "projectPath": "/path/to/project" }
```

**Response:**

```json
{
  "success": true,
  "count": 10,
  "agents": [
    { "name": "frontend-engineer", "extends": "frontend-engineer", "_builtIn": true },
    { "name": "react-specialist", "extends": "frontend-engineer", "model": "claude-opus-4-6" }
  ]
}
```

### POST /api/agents/get

Returns a single agent with fully resolved capabilities.

**Request:**

```json
{ "projectPath": "/path/to/project", "agentName": "react-specialist" }
```

**Response:**

```json
{
  "success": true,
  "agent": { "name": "react-specialist", "extends": "frontend-engineer" },
  "capabilities": {
    "role": "react-specialist",
    "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    "maxTurns": 200,
    "canUseBash": true,
    "canModifyFiles": true,
    "canCommit": true,
    "canCreatePRs": true
  }
}
```

### POST /api/agents/match

Returns the best-matching agent for a given feature.

**Request:**

```json
{ "projectPath": "/path/to/project", "featureId": "feature-123" }
```

**Response:**

```json
{
  "success": true,
  "featureId": "feature-123",
  "agent": { "name": "react-specialist", "extends": "frontend-engineer" }
}
```

Returns `"agent": null` if no agents match.

## UI Integration

The **Agents panel** in project settings displays all discovered agents with their base role, model override, and match rules. The panel is read-only --- edit the YAML manifest to change agent configuration.

On the board, features with a `routingSuggestion` show the suggested role on their Kanban card. The suggestion displays confidence level and can be overridden by selecting a different role from the dropdown.

In the feature detail view, the **role selector** dropdown lists all available roles (built-in + project agents). Select "Auto" to clear the assignment and let match rules decide on next execution.
