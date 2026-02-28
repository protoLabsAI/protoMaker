# Agent Template Authoring

Agent templates are reusable configurations that define agent identity, capabilities, routing assignments, security boundaries, and runtime behavior. This guide explains how to create custom agent templates for the dynamic role registry.

## Quick Start

**Create a simple agent template in 5 minutes:**

```typescript
import { AgentTemplateSchema } from '@protolabs-ai/types';

const securityAuditorTemplate = {
  // Identity
  name: 'security-auditor',
  displayName: 'Security Auditor',
  description: 'Reviews code for security vulnerabilities',
  role: 'custom',

  // Capabilities
  model: 'sonnet',
  tools: ['read-file', 'grep', 'bash'],
  canUseBash: true,
  canModifyFiles: false, // Read-only
  canCommit: false,
  canCreatePRs: false,

  // Behavior
  systemPrompt: 'You are a security expert. Review code for OWASP Top 10 vulnerabilities...',
};

// Validate
const validated = AgentTemplateSchema.parse(securityAuditorTemplate);

// Register via MCP tool
mcp__protolabs__register_agent_template({
  projectPath: '/path/to/project',
  template: validated,
});
```

## Template Anatomy

### Required Fields

```typescript
interface AgentTemplate {
  // --- Identity (Required) ---
  name: string; // Unique kebab-case ID
  displayName: string; // Human-readable name
  description: string; // When/why to use this agent
  role: string; // Known role or 'custom'

  // --- All other fields are optional ---
}
```

###Identity Fields

**name** - Unique identifier in kebab-case

```typescript
name: 'security-auditor'; // ✅ Valid
name: 'Security Auditor'; // ❌ Invalid (not kebab-case)
name: 'security_auditor'; // ❌ Invalid (underscore)
```

**displayName** - User-facing name

```typescript
displayName: 'Security Auditor';
displayName: 'Ava (GTM Specialist)';
```

**description** - Purpose and use cases

```typescript
description: 'Reviews code for security vulnerabilities and generates audit reports';
```

**role** - Agent classification

```typescript
// Known roles
role: 'product-manager';
role: 'backend-engineer';
role: 'devops-engineer';

// Custom role
role: 'custom';
```

**Available roles:**

| Role                  | Description                   |
| --------------------- | ----------------------------- |
| `product-manager`     | Requirements, roadmaps, PRDs  |
| `engineering-manager` | Team coordination, unblocking |
| `frontend-engineer`   | UI/UX implementation          |
| `backend-engineer`    | Server-side logic, APIs       |
| `devops-engineer`     | Infrastructure, CI/CD         |
| `qa-engineer`         | Testing, quality assurance    |
| `docs-engineer`       | Documentation writing         |
| `gtm-specialist`      | Marketing, launches, content  |
| `content-writer`      | Blog posts, social media      |
| `chief-of-staff`      | Executive coordination        |
| `pr-maintainer`       | GitHub PR reviews             |
| `board-janitor`       | Board cleanup, organization   |
| `linear-specialist`   | Linear integration            |
| `calendar-assistant`  | Scheduling, reminders         |
| `custom`              | Custom agent type             |

### Capabilities

Control what the agent can do:

```typescript
{
  // Model selection
  model: 'haiku' | 'sonnet' | 'opus',

  // Tool access
  tools: ['tool-1', 'tool-2', '*'],  // ['*'] = all tools
  disallowedTools: ['dangerous-tool'], // Denylist

  // File operations
  canModifyFiles: true | false,

  // Git operations
  canCommit: true | false,
  canCreatePRs: true | false,

  // Shell access
  canUseBash: true | false,

  // Execution limits
  maxTurns: 50,
}
```

**Example:** Read-only analyst agent

```typescript
{
  model: 'sonnet',
  tools: ['read-file', 'grep', 'search-code'],
  canModifyFiles: false,  // Read-only
  canCommit: false,
  canCreatePRs: false,
  canUseBash: false,      // No shell access
  maxTurns: 30,
}
```

**Example:** Full-stack engineer agent

```typescript
{
  model: 'sonnet',
  tools: ['*'],           // All tools
  canModifyFiles: true,
  canCommit: true,
  canCreatePRs: true,
  canUseBash: true,
  maxTurns: 100,
}
```

### System Prompt

Define agent personality and instructions:

```typescript
{
  systemPrompt: `You are a backend engineer specializing in Node.js and TypeScript.

Your responsibilities:
- Implement server-side features
- Write clean, maintainable code
- Follow repository conventions
- Write comprehensive tests

Guidelines:
- Always use TypeScript strict mode
- Prefer async/await over callbacks
- Write unit tests for all public functions
- Follow conventional commit messages`,
}
```

**Prompt composition:** Reference prompt template files

```typescript
{
  systemPromptTemplate: 'agents/backend-engineer.md',
  // Loads from libs/prompts/src/agents/backend-engineer.md
}
```

### Routing Assignments

Configure where the agent receives work from:

#### Discord Assignment

```typescript
{
  assignments: {
    discord: {
      dmUsers: ['josh', 'alice'],         // Route these DMs
      watchChannels: ['1234567890'],       // Monitor these channels
      postChannels: ['9876543210'],        // Post updates here
      keywords: ['security', 'audit'],     // Trigger words
    },
  },
}
```

#### Linear Assignment

```typescript
{
  assignments: {
    linear: {
      teamKey: 'PROTO',                    // Linear team
      projectIds: ['abc123'],              // Specific projects
      labelFilter: ['security'],           // Only these labels
      assigneeFilter: ['security-bot'],    // Only these assignees
    },
  },
}
```

#### GitHub Assignment

```typescript
{
  assignments: {
    github: {
      labelFilter: ['security', 'audit'],  // Only these labels
      repos: ['protolabs-ai/automaker'],   // Only these repos
    },
  },
}
```

### Headsdown Loop Configuration

For persistent agents that run autonomously:

```typescript
{
  headsdown: {
    model: 'haiku',                // Use faster model for loops
    maxTurns: 20,                  // Per iteration
    loop: {
      enabled: true,
      checkInterval: 60000,        // Check every 60 seconds
      maxConsecutiveErrors: 3,     // Stop after 3 errors
      workTimeout: 300000,         // 5 minutes max per iteration
    },
    idleTasks: {
      enabled: true,
      tasks: [
        'Review open PRs',
        'Check for stale issues',
      ],
    },
  },
}
```

### Desired State Monitoring

Define invariants the agent maintains:

```typescript
{
  desiredState: [
    {
      key: 'open_prs',
      operator: '<=',
      value: 5,
      description: 'Keep open PRs under 5',
      priority: 7,
    },
    {
      key: 'unread_dms',
      operator: '==',
      value: 0,
      description: 'Respond to all DMs',
      priority: 9,
    },
    {
      key: 'failing_ci_count',
      operator: '==',
      value: 0,
      description: 'Fix all failing CI checks',
      priority: 10,
    },
  ],
}
```

**Available world state keys:**

| Key                         | Description                   | Type   |
| --------------------------- | ----------------------------- | ------ |
| `backlog_count`             | Features in backlog           | number |
| `in_progress_count`         | Features in progress          | number |
| `blocked_count`             | Blocked features              | number |
| `review_count`              | Features in review            | number |
| `open_prs`                  | Open pull requests            | number |
| `failing_ci_count`          | PRs with failing CI           | number |
| `unresolved_review_threads` | Unresolved CodeRabbit threads | number |
| `stale_prs`                 | PRs with no activity in 24h   | number |
| `unread_dms`                | Unread Discord DMs            | number |
| `unanswered_mentions`       | Unanswered @mentions          | number |
| `pending_messages`          | Messages awaiting response    | number |
| `unread_notifications`      | Unread Linear notifications   | number |
| `assigned_issues`           | Linear issues assigned        | number |
| `overdue_issues`            | Issues past due date          | number |
| `consecutive_errors`        | Consecutive errors            | number |
| `total_turns`               | Total turns consumed          | number |
| `idle_duration_ms`          | Idle time in milliseconds     | number |
| `heap_usage_percent`        | Server memory usage           | number |
| `running_agents`            | Currently running agents      | number |

### Security Tier

Control template protection:

```typescript
{
  tier: 0,  // System-protected (cannot be deleted)
  tier: 1,  // User-managed (can be deleted)
}
```

## Creating Your First Template

### Step 1: Define the Agent

```typescript
const myTemplate = {
  name: 'code-reviewer',
  displayName: 'Code Reviewer',
  description: 'Reviews PRs for code quality and best practices',
  role: 'custom',

  model: 'sonnet',
  tools: ['read-file', 'grep', 'get-pr-details'],
  canModifyFiles: false,
  canCommit: false,
  canCreatePRs: false,
  canUseBash: false,
  maxTurns: 30,

  systemPrompt: `You are a code reviewer.

Review code for:
- Code quality and maintainability
- Performance issues
- Security vulnerabilities
- Test coverage
- Documentation

Provide constructive feedback with specific examples.`,
};
```

### Step 2: Validate

```typescript
import { AgentTemplateSchema } from '@protolabs-ai/types';

try {
  const validated = AgentTemplateSchema.parse(myTemplate);
  console.log('✅ Template is valid');
} catch (error) {
  console.error('❌ Validation failed:', error.errors);
}
```

### Step 3: Register

**Via MCP tool:**

```typescript
const result = await mcp__protolabs__register_agent_template({
  projectPath: '/path/to/project',
  template: validated,
});

if (result.success) {
  console.log('Registered:', result.data.name);
}
```

**Via REST API:**

```bash
curl -X POST http://localhost:3008/api/agents/register-template \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "template": {...}
  }'
```

### Step 4: Execute

```typescript
const execution = await mcp__protolabs__execute_dynamic_agent({
  projectPath: '/path/to/project',
  templateName: 'code-reviewer',
  input: {
    prNumber: 123,
    repo: 'protolabs-ai/automaker',
  },
});
```

## Built-in Templates

Automaker includes several pre-registered templates:

### Product Manager (PM)

```typescript
{
  name: 'pm',
  role: 'product-manager',
  description: 'Requirements analysis, PRDs, roadmaps',
  model: 'sonnet',
  tools: [
    'create-feature',
    'update-feature',
    'create-project',
    'get-project-spec',
  ],
  canModifyFiles: true,  // Can write PRDs
}
```

### Backend Engineer

```typescript
{
  name: 'backend-engineer',
  role: 'backend-engineer',
  description: 'Server-side implementation',
  model: 'sonnet',
  tools: ['*'],
  canModifyFiles: true,
  canCommit: true,
  canCreatePRs: true,
  canUseBash: true,
  maxTurns: 100,
}
```

### DevOps Engineer

```typescript
{
  name: 'devops-engineer',
  role: 'devops-engineer',
  description: 'Infrastructure and CI/CD',
  model: 'sonnet',
  tools: ['*'],
  canModifyFiles: true,
  canCommit: true,
  canCreatePRs: true,
  canUseBash: true,  // Full shell access
  maxTurns: 80,
}
```

### Docs Engineer

```typescript
{
  name: 'docs-engineer',
  role: 'docs-engineer',
  description: 'Documentation writing and maintenance',
  model: 'haiku',  // Lighter model
  tools: [
    'read-file',
    'write-file',
    'search-code',
  ],
  canModifyFiles: true,
  canCommit: true,
  canCreatePRs: true,
  canUseBash: false,
  maxTurns: 50,
}
```

## Template Management

### List All Templates

```typescript
const templates = await mcp__protolabs__list_agent_templates({
  projectPath: '/path/to/project',
});

console.log('Available templates:', templates.data.templates);
```

### Get Template Details

```typescript
const template = await mcp__protolabs__get_agent_template({
  projectPath: '/path/to/project',
  templateName: 'backend-engineer',
});

console.log('Template:', template.data);
```

### Update Template

```typescript
const updated = await mcp__protolabs__update_agent_template({
  projectPath: '/path/to/project',
  templateName: 'code-reviewer',
  updates: {
    model: 'opus', // Upgrade model
    maxTurns: 50, // Increase limit
  },
});
```

### Unregister Template

```typescript
const result = await mcp__protolabs__unregister_agent_template({
  projectPath: '/path/to/project',
  templateName: 'code-reviewer',
});

// Note: Tier 0 (system) templates cannot be unregistered
```

## Advanced Patterns

### Template Composition

Create specialized templates by extending base templates:

```typescript
// Base template
const baseEngineer = {
  model: 'sonnet',
  tools: ['*'],
  canModifyFiles: true,
  canCommit: true,
  canCreatePRs: true,
  canUseBash: true,
  maxTurns: 100,
};

// Specialized frontend engineer
const frontendEngineer = {
  ...baseEngineer,
  name: 'frontend-engineer',
  displayName: 'Frontend Engineer',
  role: 'frontend-engineer',
  systemPrompt: 'You are a frontend engineer specializing in React...',
  disallowedTools: ['database-query'], // No DB access
};

// Specialized backend engineer
const backendEngineer = {
  ...baseEngineer,
  name: 'backend-engineer',
  displayName: 'Backend Engineer',
  role: 'backend-engineer',
  systemPrompt: 'You are a backend engineer specializing in Node.js...',
};
```

### Multi-Channel Agent

Agent that monitors multiple platforms:

```typescript
{
  name: 'ava-gtm',
  displayName: 'Ava (GTM)',
  role: 'gtm-specialist',
  assignments: {
    discord: {
      dmUsers: ['josh', 'alice'],
      watchChannels: ['1234567890', '0987654321'],
      postChannels: ['1111111111'],
    },
    linear: {
      teamKey: 'PROTO',
      labelFilter: ['gtm', 'marketing'],
    },
    github: {
      labelFilter: ['documentation', 'website'],
    },
  },
  desiredState: [
    {
      key: 'unread_dms',
      operator: '==',
      value: 0,
      priority: 9,
    },
  ],
}
```

### Specialized Security Agent

```typescript
{
  name: 'security-scanner',
  displayName: 'Security Scanner',
  role: 'custom',
  model: 'opus',  // Use most capable model
  tools: [
    'read-file',
    'grep',
    'search-code',
    'run-security-scan',
  ],
  canModifyFiles: false,  // Read-only
  canCommit: false,
  canCreatePRs: true,     // Can create security fix PRs
  canUseBash: true,       // Run security tools
  maxTurns: 40,

  systemPrompt: `You are a security expert.

Scan for:
1. SQL injection vulnerabilities
2. XSS vulnerabilities
3. Authentication issues
4. Hardcoded secrets
5. Insecure dependencies

Generate detailed reports with:
- Vulnerability description
- Severity (Critical/High/Medium/Low)
- Affected files and lines
- Remediation steps
- Example exploit`,

  headsdown: {
    model: 'haiku',
    loop: {
      enabled: true,
      checkInterval: 3600000,  // Every hour
    },
  },
}
```

## Testing Templates

### Validation Tests

```typescript
import { describe, it, expect } from 'vitest';
import { AgentTemplateSchema } from '@protolabs-ai/types';

describe('Agent Template Validation', () => {
  it('validates a valid template', () => {
    const template = {
      name: 'test-agent',
      displayName: 'Test Agent',
      description: 'Test description',
      role: 'custom',
    };

    const result = AgentTemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it('rejects invalid name', () => {
    const template = {
      name: 'Test_Agent', // Underscore not allowed
      displayName: 'Test Agent',
      description: 'Test description',
      role: 'custom',
    };

    const result = AgentTemplateSchema.safeParse(template);
    expect(result.success).toBe(false);
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { RoleRegistryService } from './role-registry-service.js';

describe('Template Registration', () => {
  it('registers and retrieves template', async () => {
    const registry = new RoleRegistryService();

    const template = {
      name: 'test-agent',
      displayName: 'Test Agent',
      description: 'Test description',
      role: 'custom',
    };

    await registry.register(template);

    const retrieved = await registry.getTemplate('test-agent');
    expect(retrieved).toEqual(template);
  });
});
```

## Best Practices

### 1. Use Descriptive Names

**Do:**

```typescript
name: 'security-vulnerability-scanner';
name: 'frontend-code-reviewer';
```

**Don't:**

```typescript
name: 'agent1';
name: 'bot';
```

### 2. Be Specific in Descriptions

**Do:**

```typescript
description: 'Reviews TypeScript code for type safety, performance issues, and maintainability. Generates actionable feedback with code examples.';
```

**Don't:**

```typescript
description: 'Reviews code';
```

### 3. Grant Minimal Permissions

**Do:**

```typescript
{
  tools: ['read-file', 'grep'],  // Only what's needed
  canModifyFiles: false,
  canUseBash: false,
}
```

**Don't:**

```typescript
{
  tools: ['*'],         // Everything
  canModifyFiles: true,
  canUseBash: true,     // Unnecessary permissions
}
```

### 4. Use Appropriate Models

**Do:**

```typescript
// Simple tasks
{
  model: 'haiku';
}

// Standard features
{
  model: 'sonnet';
}

// Complex analysis
{
  model: 'opus';
}
```

### 5. Set Reasonable Turn Limits

**Do:**

```typescript
maxTurns: 30; // Code review
maxTurns: 50; // Documentation
maxTurns: 100; // Feature implementation
```

## Troubleshooting

### "Template name already exists"

**Issue:** Template with same name already registered.

**Solution:** Use a different name or unregister the existing template:

```typescript
await mcp__protolabs__unregister_agent_template({
  projectPath: '/path/to/project',
  templateName: 'existing-name',
});
```

### "Invalid name format"

**Issue:** Name doesn't match kebab-case pattern.

**Solution:** Use only lowercase letters, numbers, and hyphens:

```typescript
// ✅ Valid
name: 'security-auditor';
name: 'code-reviewer-v2';

// ❌ Invalid
name: 'Security_Auditor'; // Underscore
name: 'code reviewer'; // Space
name: 'CodeReviewer'; // CamelCase
```

### "Tool not found"

**Issue:** Template references non-existent tool.

**Solution:** Verify tool name matches MCP server tools:

```typescript
// Check available tools
const tools = await mcp__protolabs__list_tools();
console.log('Available tools:', tools);

// Use correct tool names
tools: ['read-file', 'write-file']; // ✅
tools: ['readFile', 'writeFile']; // ❌
```

## Learn More

- [Agent SDK Integration](./sdk-integration.md) - How agents execute
- [Authoring Skills](./authoring-skills.md) - Creating skill files
- [Authoring Prompts](./authoring-prompts.md) - Writing effective prompts
- [MCP Tools Reference](../integrations/mcp-tools-reference.md) - Available tools
