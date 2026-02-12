# Adding New Team Members

How to add a new agent role to Automaker's multi-agent system. There are two approaches:

1. **Dynamic (recommended)** — Register a template at runtime via API/MCP. No code changes needed. See [Agent Templates](./agent-templates.md).
2. **Static** — Add to the type system, create a prompt, wire Discord routing. Requires code changes and a deploy.

Use the **dynamic** approach for custom roles, experiments, and project-specific agents. Use the **static** approach when adding a new built-in role that should be available to all projects permanently.

## Dynamic Approach (No Code Changes)

Register a template via MCP:

```typescript
mcp__plugin_automaker_automaker__register_agent_template({
  template: {
    name: 'my-custom-agent',
    displayName: 'My Custom Agent',
    description: 'Does a specific thing',
    role: 'backend-engineer', // Base role for capabilities
    tier: 1,
    model: 'sonnet',
    maxTurns: 100,
    canUseBash: true,
    canModifyFiles: true,
    tags: ['custom'],
  },
});
```

Then execute it:

```typescript
mcp__plugin_automaker_automaker__execute_dynamic_agent({
  templateName: 'my-custom-agent',
  projectPath: '/path/to/project',
  prompt: 'Do the thing',
});
```

For full details, see [Agent Templates & Dynamic Role Registry](./agent-templates.md).

---

## Static Approach (Code Changes)

For adding permanent built-in roles to the type system.

## Quick Reference

| Step                | Files                                              | Description                                   |
| ------------------- | -------------------------------------------------- | --------------------------------------------- |
| 1. Define role      | `libs/types/src/agent-roles.ts`                    | Add to `AgentRole` union, `ROLE_CAPABILITIES` |
| 2. Headsdown config | `libs/types/src/headsdown.ts`                      | Add to `DEFAULT_HEADSDOWN_CONFIGS`            |
| 3. Create prompt    | `libs/prompts/src/agents/{role}-prompt.ts`         | System prompt template                        |
| 4. Export prompt    | `libs/prompts/src/index.ts`                        | Re-export the prompt function                 |
| 5. Discord routing  | `apps/server/src/services/agent-discord-router.ts` | Channel/command mapping                       |
| 6. UI integration   | Agent Runner panel                                 | Role selector dropdown                        |
| 7. Build & test     | `npm run build:packages`                           | Verify types compile                          |

## Step 1: Define the Role Type

Add the role to `libs/types/src/agent-roles.ts`:

```typescript
// 1a. Add to AgentRole union type
export type AgentRole =
  | 'product-manager'
  | 'engineering-manager'
  // ... existing roles
  | 'your-new-role'; // <-- add here

// 1b. Add capabilities
export const ROLE_CAPABILITIES: Record<AgentRole, RoleCapabilities> = {
  // ... existing roles
  'your-new-role': {
    role: 'your-new-role',
    tools: ['Read', 'Grep', 'Glob'], // See tool reference below
    maxTurns: 150,
    canUseBash: false,
    canModifyFiles: false,
    canCommit: false,
    canCreatePRs: false,
    description: 'What this role does in one line',
  },
};
```

### Tool Reference

| Tool        | Use Case               | Risk   |
| ----------- | ---------------------- | ------ |
| `Read`      | Read files             | None   |
| `Grep`      | Search file contents   | None   |
| `Glob`      | Find files by pattern  | None   |
| `WebSearch` | Search the web         | None   |
| `WebFetch`  | Fetch web content      | None   |
| `Write`     | Create/overwrite files | Medium |
| `Edit`      | Edit existing files    | Medium |
| `Bash`      | Execute commands       | High   |
| `Task`      | Spawn subagents        | Medium |

**Guidelines:**

- Research-only roles (GTM, PM): `Read, Grep, Glob, WebSearch, WebFetch` + optionally `Write, Edit` for drafts
- Engineering roles: Add `Bash` for builds/tests, `Write/Edit` for code
- Management roles: No file modification, read-only + `Task` for delegation
- Never give `Bash` to non-engineering roles unless specifically needed

### Capability Flags

| Flag             | When to enable                                        |
| ---------------- | ----------------------------------------------------- |
| `canUseBash`     | Role needs to run shell commands (builds, tests, git) |
| `canModifyFiles` | Role creates or edits files                           |
| `canCommit`      | Role creates git commits                              |
| `canCreatePRs`   | Role creates pull requests                            |

## Step 2: Add Headsdown Configuration

Add to `libs/types/src/headsdown.ts`:

```typescript
export const DEFAULT_HEADSDOWN_CONFIGS: Record<AgentRole, Partial<HeadsdownConfig>> = {
  // ... existing roles
  'your-new-role': {
    model: 'sonnet', // haiku (fast/cheap), sonnet (balanced), opus (best)
    maxTurns: 150, // Prevent infinite loops
    loop: {
      enabled: true,
      checkInterval: 30000, // 30s between work checks
      maxConsecutiveErrors: 5, // Stop after 5 failures
      workTimeout: 3600000, // 1hr max work session
    },
    idleTasks: {
      enabled: false, // Enable if role should do cleanup when idle
      tasks: [],
    },
  },
};
```

### Model Selection Guide

| Model    | Cost   | Speed  | Use When                                  |
| -------- | ------ | ------ | ----------------------------------------- |
| `haiku`  | Low    | Fast   | Simple tasks, docs, QA checks             |
| `sonnet` | Medium | Medium | Standard work, most roles                 |
| `opus`   | High   | Slow   | Complex reasoning, architecture decisions |

## Step 3: Create the Prompt Template

Create `libs/prompts/src/agents/{role}-prompt.ts`:

```typescript
export interface YourRoleConfig {
  context?: string;
  focus?: string;
}

export function getYourRolePrompt(config: YourRoleConfig = {}): string {
  const { context = '', focus = '' } = config;

  return `You are the [Role Name] for [organization].

## Your Responsibilities
- [Key responsibility 1]
- [Key responsibility 2]

## Scope
You manage: [what's in scope]
You do NOT manage: [what's out of scope — important for preventing drift]

## Operating Principles
1. [Principle 1]
2. [Principle 2]

${context ? `\n## Additional Context\n${context}` : ''}
${focus ? `\n## Current Focus\n${focus}` : ''}
`;
}
```

**Prompt best practices:**

- Be specific about scope boundaries (what the role does NOT do)
- Include the organization/project context
- Add dynamic sections for runtime context injection
- Keep under 2000 tokens for the base prompt
- Reference existing prompts at `libs/prompts/src/agents/` for patterns

## Step 4: Export the Prompt

Add to `libs/prompts/src/index.ts`:

```typescript
export { getYourRolePrompt } from './agents/your-role-prompt.js';
```

## Step 5: Wire Discord Routing

In `apps/server/src/services/agent-discord-router.ts`, add channel/command mapping so the agent can be summoned from Discord:

```typescript
// Map Discord channels to roles
const CHANNEL_ROLE_MAP: Record<string, AgentRole> = {
  'existing-channel-id': 'existing-role',
  'your-channel-id': 'your-new-role', // <-- add mapping
};
```

**Routing patterns:**

- **Channel-based**: Messages in a specific channel route to the role
- **Command-based**: `@agent /role-name` routes to the role
- **Keyword-based**: Messages containing keywords trigger the role

## Step 6: UI Integration

The Agent Runner panel (`apps/ui/src/components/views/`) shows a role selector dropdown populated from `ROLE_CAPABILITIES`. Once you add the role to the type system, it appears automatically in the dropdown.

For custom UI (role-specific settings, tool displays), modify the Agent Runner view components.

## Step 7: Build and Verify

```bash
# Build all shared packages (types + prompts)
npm run build:packages

# Verify types compile
npx tsc --noEmit -p libs/types/tsconfig.json

# Run package tests
npm run test:packages

# Build server to verify integration
npm run build:server
```

## Authority Agent Integration (Optional)

If the role needs to run autonomously (event-driven, not just on-demand), create an authority agent:

1. Create `apps/server/src/services/authority-agents/{role}-agent.ts`
2. Register in `apps/server/src/services/authority-service.ts`
3. See `docs/agents/adding-teammates.md` for the full authority agent guide

## Linear Integration (Optional)

For roles that interact with Linear (like GTM):

1. Linear MCP is available via the plugin (`linear-mcp-server`)
2. Scope access per role using Linear project IDs
3. For full Linear Agent API integration (mentions, delegations), see the Linear Agent Integration milestone

## Existing Roles

| Role                  | Model  | Tools                                              | Description                      |
| --------------------- | ------ | -------------------------------------------------- | -------------------------------- |
| `product-manager`     | opus   | Read, Grep, Glob, WebSearch, WebFetch, Task        | PRDs, research, user engagement  |
| `engineering-manager` | sonnet | Read, Grep, Glob, Task                             | Feature breakdown, PR management |
| `frontend-engineer`   | sonnet | Read, Write, Edit, Glob, Grep                      | React, UI/UX implementation      |
| `backend-engineer`    | sonnet | Read, Write, Edit, Glob, Grep, Bash                | APIs, services, backend          |
| `devops-engineer`     | sonnet | Read, Write, Edit, Glob, Grep, Bash                | CI/CD, infrastructure            |
| `qa-engineer`         | haiku  | Read, Bash, Grep, Glob                             | Testing, PR review               |
| `docs-engineer`       | haiku  | Read, Write, Edit, Glob, Grep                      | Documentation, changelogs        |
| `gtm-specialist`      | sonnet | Read, Grep, Glob, WebSearch, WebFetch, Write, Edit | Content, marketing, brand        |

## Related Documentation

- [Authority Agent Guide](../agents/adding-teammates.md) — Full guide for event-driven authority agents
- [Agent Architecture](../agents/architecture.md) — How the agent system works
- [Agent Teams](../agents/creating-agent-teams.md) — Multi-agent coordination patterns
- [Org Chart](../authority/org-chart.md) — Authority system, trust levels, permissions
- [Role Definitions](../authority/roles/) — Detailed role descriptions
