# Agent Templates & Dynamic Role Registry

The dynamic role registry allows runtime creation, modification, and execution of agent templates without code changes. Templates define everything an agent needs: role, model, tools, capabilities, and trust level.

## Overview

```
┌──────────────────────────────────────────────────┐
│ RoleRegistryService (in-memory, tier-protected)  │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │ Tier 0      │ │ Tier 1      │ │ Tier 2    │  │
│  │ (built-in)  │ │ (user)      │ │ (runtime) │  │
│  │ 9 templates │ │ custom      │ │ temporary │  │
│  └─────────────┘ └─────────────┘ └───────────┘  │
├──────────────────────────────────────────────────┤
│ AgentFactoryService     DynamicAgentExecutor     │
│ (template → config)     (config → execution)     │
└──────────────────────────────────────────────────┘
```

- **RoleRegistryService** — In-memory store for agent templates. Tier 0 templates are protected (cannot be updated/deleted).
- **AgentFactoryService** — Resolves a template into an `AgentConfig` with model resolution and override merging.
- **DynamicAgentExecutor** — Executes an agent from an `AgentConfig`.

## Template Schema

```typescript
interface AgentTemplate {
  // Required
  name: string; // kebab-case identifier (e.g., "my-custom-agent")
  displayName: string; // Human-readable name
  description: string; // What this agent does
  role: AgentRole; // One of the 9 built-in roles or 'custom'
  tier: number; // 0 = protected, 1+ = user-defined

  // Model & execution
  model?: string; // 'haiku' | 'sonnet' | 'opus' (default: 'sonnet')
  maxTurns?: number; // Max conversation turns (default: 100)

  // Capabilities
  canUseBash?: boolean;
  canModifyFiles?: boolean;
  canCommit?: boolean;
  canCreatePRs?: boolean;
  canSpawnAgents?: boolean;

  // Advanced
  trustLevel?: number; // 0-3, controls what actions are allowed
  tools?: string[]; // Tool allowlist
  allowedSubagentRoles?: string[];
  tags?: string[]; // Searchable tags
  systemPrompt?: string; // Custom system prompt
  desiredState?: DesiredStateCondition[]; // Reactive activation conditions
}
```

## Built-in Templates (Tier 0)

Registered at server startup. Cannot be modified or removed via API.

| Name                  | Role                | Model  | Trust | Capabilities            |
| --------------------- | ------------------- | ------ | ----- | ----------------------- |
| `backend-engineer`    | backend-engineer    | sonnet | 2     | bash, files, commit, PR |
| `frontend-engineer`   | frontend-engineer   | sonnet | 2     | bash, files, commit, PR |
| `devops-engineer`     | devops-engineer     | sonnet | 2     | bash, files, commit, PR |
| `qa-engineer`         | qa-engineer         | sonnet | 1     | bash, files, commit, PR |
| `docs-engineer`       | docs-engineer       | haiku  | 1     | files, commit, PR       |
| `product-manager`     | product-manager     | sonnet | 1     | read-only               |
| `engineering-manager` | engineering-manager | sonnet | 1     | read-only               |
| `chief-of-staff`      | chief-of-staff      | opus   | 3     | all + spawn agents      |
| `gtm-specialist`      | gtm-specialist      | sonnet | 1     | files only              |

## REST API

All endpoints require API key authentication. Base path: `/api/agents`

| Method | Endpoint                | Description                 |
| ------ | ----------------------- | --------------------------- |
| POST   | `/templates/list`       | List all templates          |
| POST   | `/templates/get`        | Get template by name        |
| POST   | `/templates/register`   | Register new template       |
| POST   | `/templates/update`     | Update existing template    |
| POST   | `/templates/unregister` | Remove a template           |
| POST   | `/execute`              | Execute agent from template |

### Register a Template

```bash
curl -X POST http://localhost:3008/api/agents/templates/register \
  -H "Authorization: Bearer $AUTOMAKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": {
      "name": "code-reviewer",
      "displayName": "Code Reviewer",
      "description": "Reviews PRs for code quality and security",
      "role": "qa-engineer",
      "tier": 1,
      "model": "sonnet",
      "maxTurns": 50,
      "canUseBash": true,
      "canModifyFiles": false,
      "tags": ["review", "quality"]
    }
  }'
```

### Execute an Agent

```bash
curl -X POST http://localhost:3008/api/agents/execute \
  -H "Authorization: Bearer $AUTOMAKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "templateName": "code-reviewer",
    "projectPath": "/path/to/project",
    "prompt": "Review the latest PR for security issues",
    "overrides": {
      "maxTurns": 25
    }
  }'
```

## MCP Tools

Available via the Automaker Claude Code plugin:

| Tool                        | Description                           |
| --------------------------- | ------------------------------------- |
| `list_agent_templates`      | List templates (optional role filter) |
| `get_agent_template`        | Get template by name                  |
| `register_agent_template`   | Register a new template               |
| `update_agent_template`     | Update an existing template           |
| `unregister_agent_template` | Remove a template                     |
| `execute_dynamic_agent`     | Run an agent from a template          |
| `get_role_registry_status`  | Get registry overview                 |

### MCP Examples

```typescript
// List all templates
mcp__plugin_automaker_automaker__list_agent_templates();

// Register a custom template
mcp__plugin_automaker_automaker__register_agent_template({
  template: {
    name: 'security-auditor',
    displayName: 'Security Auditor',
    description: 'Scans codebase for security vulnerabilities',
    role: 'qa-engineer',
    tier: 1,
    model: 'sonnet',
    canUseBash: true,
    canModifyFiles: false,
    tags: ['security', 'audit'],
  },
});

// Execute an agent
mcp__plugin_automaker_automaker__execute_dynamic_agent({
  templateName: 'security-auditor',
  projectPath: '/Users/me/dev/myproject',
  prompt: 'Audit the authentication module for OWASP Top 10 vulnerabilities',
});
```

## Tier System

| Tier | Protection | Who Creates         | Can Modify | Can Delete |
| ---- | ---------- | ------------------- | ---------- | ---------- |
| 0    | Protected  | Server startup only | No         | No         |
| 1    | Standard   | Users via API/MCP   | Yes        | Yes        |
| 2    | Runtime    | Agents/automation   | Yes        | Yes        |

Tier 0 templates are the 9 built-in roles. They serve as a stable foundation — even if all custom templates are removed, the system always has these defaults.

## Factory Pattern

`AgentFactoryService.createFromTemplate()` resolves a template into an executable `AgentConfig`:

1. Looks up template in registry
2. Resolves model alias (e.g., `'sonnet'` → `'claude-sonnet-4-5-20250929'`)
3. Applies any overrides passed at execution time
4. Returns a fully resolved `AgentConfig`

Override priority: `execution overrides > template defaults > role defaults`

## Health Check

The standard health check (`GET /api/health/standard`) includes registry status:

```json
{
  "registry": {
    "templateCount": 11,
    "roles": ["backend-engineer", "frontend-engineer", "custom", ...]
  }
}
```

## Related

- [Adding Team Members](./adding-team-members.md) — Static role setup (types, prompts, Discord)
- [CLAUDE.md](../../CLAUDE.md) — Project conventions and MCP tool reference
