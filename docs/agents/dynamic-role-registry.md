# Dynamic Role Registry & Agent Factory

The Dynamic Role Registry system enables runtime agent creation, configuration, and execution through a template-based architecture. Instead of hardcoding agent configurations, templates define identity, capabilities, routing, and security boundaries — and agents are created on-demand from these templates.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Template Schema (Zod)                                │
│  libs/types/src/agent-templates.ts                          │
│  Defines: identity, capabilities, assignments, security     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  RoleRegistryService                                        │
│  apps/server/src/services/role-registry-service.ts          │
│  In-memory Map<name, AgentTemplate>                         │
│  register() → validate → store                              │
│  get() / list() / unregister()                              │
│  Tier enforcement: tier 0 = protected, tier 1 = managed     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  AgentFactoryService                                        │
│  apps/server/src/services/agent-factory-service.ts          │
│  createFromTemplate(name, projectPath, overrides?)          │
│  createWithInheritance(parent, child, projectPath)          │
│  Returns: AgentConfig (resolved, ready to execute)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  DynamicAgentExecutor                                       │
│  apps/server/src/services/dynamic-agent-executor.ts         │
│  execute(config, options) → simpleQuery / streamingQuery    │
│  Builds system prompt with capability constraints           │
│  Filters disallowed tools, captures output, classifies errs │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Template Schema

**Location:** `libs/types/src/agent-templates.ts`

Templates are validated at runtime with Zod. A template defines everything about an agent type:

```typescript
import type { AgentTemplate } from '@protolabs-ai/types';

const myTemplate: AgentTemplate = {
  // Identity
  name: 'security-reviewer',
  displayName: 'Security Reviewer',
  description: 'Reviews code for security vulnerabilities',
  role: 'qa-engineer',
  tier: 1, // 0=protected (system), 1=managed (user)

  // Capabilities
  model: 'sonnet',
  tools: ['Read', 'Glob', 'Grep', 'WebSearch'],
  disallowedTools: ['Bash', 'Write', 'Edit'], // Read-only
  canUseBash: false,
  canModifyFiles: false,
  canCommit: false,
  canCreatePRs: false,
  maxTurns: 30,

  // Behavior
  systemPrompt: 'You are a security reviewer. Analyze code for OWASP Top 10...',
  canSpawnAgents: false,

  // Security
  trustLevel: 1,
  maxRiskAllowed: 'low',

  // Assignments (routing)
  assignments: {
    discord: {
      dmUsers: [],
      watchChannels: ['<channel-id>'],
      postChannels: ['<channel-id>'],
      keywords: ['security', 'vulnerability', 'CVE'],
    },
  },

  // Metadata
  author: 'automaker',
  version: '1.0.0',
  tags: ['security', 'review', 'read-only'],
};
```

**Known Roles:** `product-manager`, `engineering-manager`, `frontend-engineer`, `backend-engineer`, `devops-engineer`, `qa-engineer`, `docs-engineer`, `gtm-specialist`, `chief-of-staff`, `custom`

### 2. RoleRegistryService

**Location:** `apps/server/src/services/role-registry-service.ts`

In-memory registry for agent templates. Templates are validated against the Zod schema on registration.

```typescript
import { RoleRegistryService } from './services/role-registry-service.js';

const registry = new RoleRegistryService(events);

// Register a template
const result = registry.register(myTemplate);
// { success: true } or { success: false, error: 'Validation failed: ...' }

// Retrieve
const template = registry.get('security-reviewer');

// List all, or filter by role
const allTemplates = registry.list();
const qaTemplates = registry.list('qa-engineer');

// Unregister (only tier 1)
registry.unregister('security-reviewer');
// Tier 0 templates refuse: "Cannot unregister protected template"
```

**Tier Enforcement:**

- **Tier 0 (protected):** System templates (Chief of Staff, PM, ProjM, EM). Cannot be overwritten or unregistered.
- **Tier 1 (managed):** User-created templates. Can be updated or removed.

### 3. AgentFactoryService

**Location:** `apps/server/src/services/agent-factory-service.ts`

Creates fully-resolved `AgentConfig` objects from registered templates. Supports overrides and template inheritance.

```typescript
import { AgentFactoryService } from './services/agent-factory-service.js';

const factory = new AgentFactoryService(registry, events);

// Basic creation
const config = factory.createFromTemplate('security-reviewer', '/path/to/project');

// With overrides (tools are additive, model replaces)
const config = factory.createFromTemplate('security-reviewer', '/path/to/project', {
  model: 'opus', // Override model
  maxTurns: 50, // Override turns
  tools: ['WebFetch'], // ADDS to existing tools
});

// Template inheritance
const config = factory.createWithInheritance(
  'backend-engineer', // parent template
  {
    name: 'api-specialist',
    displayName: 'API Specialist',
    description: 'Backend engineer focused on REST APIs',
    role: 'backend-engineer',
    systemPrompt: 'Focus on REST API design and OpenAPI specs...',
    tools: ['WebFetch'], // Added to parent's tools
  },
  '/path/to/project'
);
```

**Key behaviors:**

- `tools` overrides are **additive** (merged with template tools, deduplicated)
- `model` overrides **replace** the template model
- `capabilities` overrides merge at the field level
- Template not found throws a descriptive error
- Emits `authority:agent-registered` events on creation

**AgentConfig output:**

```typescript
interface AgentConfig {
  templateName: string;
  resolvedModel: string; // Full model ID (e.g., 'claude-sonnet-4-5-20250929')
  modelAlias: string; // Short alias (e.g., 'sonnet')
  tools: string[];
  disallowedTools: string[];
  maxTurns: number;
  role: string;
  displayName: string;
  trustLevel: number;
  systemPrompt?: string;
  capabilities: {
    canUseBash: boolean;
    canModifyFiles: boolean;
    canCommit: boolean;
    canCreatePRs: boolean;
    canSpawnAgents: boolean;
  };
  allowedSubagentRoles: string[];
  projectPath: string;
}
```

### 4. DynamicAgentExecutor

**Location:** `apps/server/src/services/dynamic-agent-executor.ts`

Executes agents from factory-configured `AgentConfig`. Handles query routing, system prompt assembly, tool filtering, and error classification.

```typescript
import { DynamicAgentExecutor } from './services/dynamic-agent-executor.js';

const executor = new DynamicAgentExecutor(events);

// Simple execution (non-streaming)
const result = await executor.execute(config, {
  prompt: 'Review the authentication middleware for security issues',
});

// Streaming execution
const result = await executor.execute(config, {
  prompt: 'Analyze the API endpoints',
  onText: (text) => console.log(text),
  onToolUse: (tool, input) => console.log(`Using ${tool}`),
  abortController: new AbortController(),
  additionalSystemPrompt: 'Focus on input validation.',
});

// Result
if (result.success) {
  console.log(result.output); // Agent's text output
  console.log(result.durationMs); // Execution time
} else {
  console.log(result.error); // Error message
  console.log(result.errorType); // 'execution', 'rate_limit', etc.
}
```

**System prompt assembly:**

1. Template's `systemPrompt` (if set)
2. `additionalSystemPrompt` from execute options
3. Capability constraints (auto-generated from config):
   - `canUseBash: false` → "You MUST NOT execute bash commands."
   - `canModifyFiles: false` → "You MUST NOT modify any files."
   - `canCommit: false` → "You MUST NOT create git commits."
   - `canCreatePRs: false` → "You MUST NOT create pull requests."

**Tool filtering:** `disallowedTools` are removed from the `tools` list before execution.

## End-to-End Flow

```
1. Register template → RoleRegistryService validates + stores

2. Create agent config:
   AgentFactoryService.createFromTemplate('my-agent', projectPath)
     → Looks up template in registry
     → Resolves model alias → full model ID
     → Applies overrides (tools additive, model replacement)
     → Returns AgentConfig

3. Execute agent:
   DynamicAgentExecutor.execute(config, { prompt: '...' })
     → Builds system prompt (template + constraints)
     → Filters disallowed tools
     → Routes to simpleQuery or streamingQuery
     → Returns ExecutionResult { success, output, durationMs, error? }
```

## Assignment Routing

Templates include optional `assignments` that define how external events route to the agent:

### Discord Routing

```typescript
assignments: {
  discord: {
    dmUsers: ['your-username'],   // DMs from these users → this agent
    watchChannels: ['123...'],    // Monitor these channels
    postChannels: ['456...'],     // Post updates here
    keywords: ['deploy', 'infra'] // Only trigger on these keywords
  }
}
```

### Linear Routing

```typescript
assignments: {
  linear: {
    teamKey: 'PROTO',
    projectIds: ['proj-123'],
    labelFilter: ['security'],     // Only security-labeled issues
    assigneeFilter: ['your-username'] // Only issues assigned to you
  }
}
```

### GitHub Routing

```typescript
assignments: {
  github: {
    labelFilter: ['bug', 'security'],
    repos: ['proto-labs-ai/automaker']
  }
}
```

## Testing

Each component has dedicated unit tests:

- `tests/unit/services/role-registry-service.test.ts` — 12 tests
- `tests/unit/services/agent-factory-service.test.ts` — 14 tests
- `tests/unit/services/dynamic-agent-executor.test.ts` — 8 tests

Run all:

```bash
npm run test:server -- tests/unit/services/role-registry-service.test.ts tests/unit/services/agent-factory-service.test.ts tests/unit/services/dynamic-agent-executor.test.ts
```

## Related Documentation

- [Architecture Overview](./architecture.md) — How agents fit into the broader system
- [Adding Agent Teammates](./adding-teammates.md) — Creating authority agents
- [MCP Integration](./mcp-integration.md) — Programmatic agent control (MCP tools for the registry/factory coming in M4)
