# Authoring Agent Templates

Agent templates define the identity, capabilities, and constraints of AI agents in protoLabs Studio. This guide shows you how to create custom agent templates to extend the agent system with domain-specific expertise.

## What Are Agent Templates?

An agent template is a configuration object that defines:

- **Identity** - Name, role, and persona for the agent
- **Capabilities** - What the agent is designed to do
- **Security level** - What operations the agent can perform
- **Default tools** - Which MCP tools the agent has access to
- **Constraints** - Rules and boundaries the agent must follow

Templates are validated using [Zod](https://github.com/colinhacks/zod) for type safety.

## Template Anatomy

A complete agent template looks like this:

```typescript
import type { AgentTemplate } from '@protolabsai/types';

const securityAuditorTemplate: AgentTemplate = {
  // Identity
  id: 'security-auditor',
  name: 'Alex',
  role: 'Security Auditor',
  description:
    'Security specialist focused on vulnerability assessment and secure coding practices',

  // Capabilities
  capabilities: [
    'Identify security vulnerabilities in code',
    'Review authentication and authorization logic',
    'Audit dependency security',
    'Recommend secure coding patterns',
  ],

  // Security level (what operations are allowed)
  securityLevel: 'read_only', // 'read_only' | 'standard' | 'elevated'

  // Default tools the agent can access
  defaultTools: ['read-file', 'search-codebase', 'list-features', 'get-feature'],

  // Behavioral constraints
  constraints: [
    'Never modify production configuration files',
    'Always explain vulnerability severity',
    'Reference OWASP guidelines when applicable',
  ],

  // Optional: custom system prompt additions
  systemPromptAdditions: `
You specialize in identifying security issues. For each finding:
1. Rate severity: Critical / High / Medium / Low
2. Explain the attack vector
3. Provide a code example of the fix
`,
};
```

## Security Levels

Security levels control what an agent can do:

| Level       | Operations Allowed                                         | Use Case                      |
| ----------- | ---------------------------------------------------------- | ----------------------------- |
| `read_only` | Read files, search code, list resources                    | Auditors, reviewers, analysts |
| `standard`  | Read + write files, create features, run tests             | Standard development agents   |
| `elevated`  | All standard + manage settings, create branches, push code | Lead engineers, DevOps agents |

**Best practice:** Use the lowest security level that enables the agent's intended function.

## Creating Your First Template

This tutorial creates a "Documentation Writer" agent that specializes in writing and reviewing docs.

### Step 1: Define the Template

Create `apps/server/src/services/authority-agents/templates/docs-writer.ts`:

```typescript
import type { AgentTemplate } from '@protolabsai/types';

export const docsWriterTemplate: AgentTemplate = {
  id: 'docs-writer',
  name: 'Dana',
  role: 'Documentation Writer',
  description:
    'Technical writer specializing in developer documentation, API references, and guides',

  capabilities: [
    'Write clear technical documentation',
    'Review and improve existing docs',
    'Create API reference pages',
    'Write step-by-step tutorials',
    'Ensure documentation follows Diataxis framework',
  ],

  securityLevel: 'standard',

  defaultTools: ['read-file', 'write-file', 'list-features', 'search-codebase'],

  constraints: [
    'Follow the documentation standards in docs/dev/docs-standard.md',
    'Use outcome-focused headings (verbs, not nouns)',
    'Show code examples before prose explanations',
    'Keep pages under 800 lines',
    'Use kebab-case for all filenames',
  ],

  systemPromptAdditions: `
You are a technical writer following the Diataxis framework:
- Tutorials: Learning-oriented, step-by-step guides
- How-to guides: Task-oriented, assume knowledge
- Reference: Information-oriented, complete and accurate
- Explanation: Understanding-oriented, conceptual

Always identify which type of content you are writing before starting.
`,
};
```

### Step 2: Register the Template

Add to the template registry in `apps/server/src/services/authority-agents/templates/index.ts`:

```typescript
export { docsWriterTemplate } from './docs-writer.js';
```

### Step 3: Load in Registry

The dynamic role registry picks up templates automatically from the index. You can verify:

```typescript
import { getAgentTemplate } from '@protolabsai/types';

const template = getAgentTemplate('docs-writer');
console.log(template?.name); // 'Dana'
```

### Step 4: Test the Agent

```typescript
// Via MCP tool
mcp__protolabs__start_agent({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  agentRole: 'docs-writer', // Uses your new template
  model: 'sonnet',
});
```

## Built-in Agent Templates

protoLabs Studio ships with these built-in templates:

### Product Manager (PM)

**ID:** `pm`
**Name:** Alex
**Capabilities:** Requirements gathering, feature prioritization, SPARC PRD writing
**Security:** read_only

### Project Manager (ProjM)

**ID:** `projm`
**Name:** Jordan
**Capabilities:** Sprint planning, dependency management, milestone tracking
**Security:** standard

### Engineering Manager (EM)

**ID:** `em`
**Name:** Sam
**Capabilities:** Code review strategy, technical decision making, team coordination
**Security:** standard

### Lead Engineer

**ID:** `lead-engineer`
**Name:** Kai
**Capabilities:** Full-stack implementation, architecture decisions, PR creation
**Security:** elevated

### Frontend Engineer

**ID:** `frontend-engineer`
**Name:** Matt
**Capabilities:** React components, Tailwind CSS, UI architecture
**Security:** standard

### Backend Engineer

**ID:** `backend-engineer`
**Name:** Kai
**Capabilities:** Express routes, services, API design
**Security:** standard

### DevOps Engineer

**ID:** `devops-engineer`
**Name:** Frank
**Capabilities:** Docker, CI/CD, infrastructure management
**Security:** elevated

## Template Validation

Templates are validated at load time. Common validation errors:

### Missing Required Fields

```typescript
// ❌ Missing 'capabilities'
const bad: AgentTemplate = {
  id: 'my-agent',
  name: 'Bob',
  role: 'Analyst',
  // capabilities is required
};

// ✅ Correct
const good: AgentTemplate = {
  id: 'my-agent',
  name: 'Bob',
  role: 'Analyst',
  capabilities: ['Analyze data', 'Write reports'],
  securityLevel: 'read_only',
  defaultTools: [],
  constraints: [],
};
```

### Invalid Security Level

```typescript
// ❌ Invalid level
securityLevel: 'admin', // Not a valid option

// ✅ Valid levels
securityLevel: 'read_only' | 'standard' | 'elevated'
```

## Dynamic Role Registry

The dynamic role registry manages template loading at runtime:

### Listing Available Templates

```typescript
import { listAgentTemplates } from '@protolabsai/types';

const templates = listAgentTemplates();
templates.forEach((t) => console.log(`${t.id}: ${t.name} (${t.role})`));
```

### Getting a Specific Template

```typescript
import { getAgentTemplate } from '@protolabsai/types';

const template = getAgentTemplate('lead-engineer');
if (template) {
  console.log(template.capabilities);
}
```

### Custom Template Loading

You can load templates from external sources:

```typescript
import { registerAgentTemplate } from '@protolabsai/types';

// Load from external config
const customTemplate = await loadCustomTemplate('/path/to/template.json');
registerAgentTemplate(customTemplate);
```

## Agent Template vs. Agent Skills

Templates and skills serve different purposes:

| Concept      | What It Is                             | Where It Lives                      |
| ------------ | -------------------------------------- | ----------------------------------- |
| **Template** | Agent identity, capabilities, security | `libs/types/src/agent-templates.ts` |
| **Skill**    | Reusable procedure or workflow         | `.automaker/skills/*.md`            |

**Use templates for:** Defining who an agent is and what it can do.
**Use skills for:** Teaching agents how to perform specific tasks.

A `docs-writer` template + `documentation-review` skill = a well-configured docs agent.

See [Authoring Skills](/guides/authoring-skills) for the skill system.

## Best Practices

### 1. Give Agents Specific Capabilities

```typescript
// ❌ Too vague
capabilities: ['Write code', 'Help users'];

// ✅ Specific and actionable
capabilities: [
  'Implement Express REST endpoints',
  'Write Vitest unit tests for service methods',
  'Review OpenAPI spec compliance',
  'Design database schema with TypeORM entities',
];
```

### 2. Apply Least-Privilege Security

```typescript
// ❌ Over-privileged for a read-only audit agent
securityLevel: 'elevated';

// ✅ Correct for an audit agent
securityLevel: 'read_only';
```

### 3. Constrain Specific Behaviors

```typescript
// ✅ Actionable constraints
constraints: [
  'Never delete files without confirmation',
  'Always run tests before creating a PR',
  'Use TypeScript strict mode in all new files',
  'Import from @protolabsai/* packages, never relative paths in apps/',
];
```

### 4. Keep System Prompt Additions Focused

```typescript
// ✅ Focused, actionable additions
systemPromptAdditions: `
When implementing Express routes:
1. Always validate inputs with Zod
2. Use the error-handler middleware pattern
3. Return consistent { success, data, error } response shapes
`,
```

## Learn More

- [Authoring Skills](/guides/authoring-skills) - Create procedural skills for agents
- [Agent SDK Integration](./sdk-integration.md) - How agents execute with the SDK
- [Creating MCP Tools](../dev/creating-mcp-tools.md) - Extend agent tool access
