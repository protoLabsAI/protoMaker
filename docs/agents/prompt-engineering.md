# Prompt engineering

How the protoLabs prompt system works and how to modify it. Covers the three-layer architecture, composition patterns, the prompt registry, default prompts, Langfuse resolution, and guidelines for writing effective prompts.

## Prompt architecture

Prompts in protoLabs are assembled from three layers:

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: Runtime Context Injection                  │
│  Feature description, context files, memory files,  │
│  sibling reflections, recovery context              │
└──────────────────────┬──────────────────────────────┘
                       │ appended at execution time
┌──────────────────────▼──────────────────────────────┐
│  Layer 2: Role-Specific Prompts                      │
│  matt.ts, sam.ts, kai.ts, frank.ts, ava.ts, etc.   │
│  Each composes the shared base + role instructions  │
└──────────────────────┬──────────────────────────────┘
                       │ builds on
┌──────────────────────▼──────────────────────────────┐
│  Layer 1: Shared Base Fragments                      │
│  team-base.ts: TEAM_ROSTER, BRAND_IDENTITY,         │
│  CONTEXT7_GUIDE, WORKTREE_SAFETY, PORT_PROTECTION,  │
│  PROCESS_GUARD, MONOREPO_STANDARDS,                  │
│  CONTINUOUS_IMPROVEMENT                              │
└─────────────────────────────────────────────────────┘
```

### Layer 1: Shared base fragments

All agents share a set of prompt fragments defined in `libs/prompts/src/shared/team-base.ts`. These provide universal knowledge:

| Fragment                 | Purpose                                                   | Lines |
| ------------------------ | --------------------------------------------------------- | ----- |
| `TEAM_ROSTER`            | Who does what, delegation routing table                   | ~15   |
| `BRAND_IDENTITY`         | protoLabs vs Automaker naming rules                       | ~8    |
| `CONTEXT7_GUIDE`         | How to look up live library docs via MCP                  | ~20   |
| `WORKTREE_SAFETY`        | Never `cd` into `.worktrees/`, use absolute paths         | ~4    |
| `PORT_PROTECTION`        | Never kill processes on ports 3007/3008/3009              | ~8    |
| `PROCESS_GUARD`          | Never start long-running or background processes          | ~12   |
| `MONOREPO_STANDARDS`     | Package dependency chain, import conventions, build order | ~20   |
| `CONTINUOUS_IMPROVEMENT` | Track bugs/debt in Linear (search-before-create)          | ~35   |

### Composition functions

Two functions compose these fragments for different agent categories:

**`getEngineeringBase(profile?)`** — Full shared base for engineering agents (Matt, Sam, Kai, Frank, generic roles). Includes all 8 fragments.

**`getContentBase(profile?)`** — Lighter base for content/GTM agents (Jon, Cindi). Includes only `TEAM_ROSTER`, `BRAND_IDENTITY`, `CONTEXT7_GUIDE`, and `CONTINUOUS_IMPROVEMENT`. Content agents don't need worktree safety or monorepo standards.

### Layer 2: Role-specific prompts

Each persona has a prompt file in `libs/prompts/src/agents/`:

```
libs/prompts/src/agents/
├── ava.ts              # Chief of Staff — orchestration, no code writing
├── matt.ts             # Frontend — React, Tailwind, components, a11y
├── sam.ts              # Agent infra — LangGraph, providers, observability
├── kai.ts              # Backend — Express routes, services, API design
├── frank.ts            # DevOps — Docker, CI/CD, deploy, monitoring
├── cindi.ts            # Content — blog posts, docs, training data, SEO
├── jon.ts              # GTM — content strategy, brand, social media
├── pr-maintainer.ts    # Pipeline — auto-merge, CodeRabbit, format fixes
├── board-janitor.ts    # Board hygiene — stale features, dependency repair
├── linear-specialist.ts # Linear — issues, sprints, projects, initiatives
├── product-manager-prompt.ts     # PM authority agent
├── engineering-manager-prompt.ts # EM authority agent
├── frontend-engineer-prompt.ts   # Generic frontend template
├── backend-engineer-prompt.ts    # Generic backend template
├── devops-engineer-prompt.ts     # Generic devops template
├── qa-engineer-prompt.ts         # QA template
├── docs-engineer-prompt.ts       # Docs template
└── gtm-specialist-prompt.ts      # Generic GTM template
```

Each role prompt function calls `getEngineeringBase()` or `getContentBase()` and appends role-specific instructions.

### Layer 3: Runtime context injection

At execution time, additional context is appended:

- **Feature description** — title, description, acceptance criteria, dependencies
- **Context files** — from `.automaker/context/` (coding standards, architecture rules)
- **Memory files** — from `.automaker/memory/` (relevance-ranked, top N)
- **Sibling reflections** — learnings from recently completed sibling features
- **Recovery context** — previous error output on retry

See [Context System](./context-system.md) for the full context loading flow.

## Prompt registry

The prompt registry (`libs/prompts/src/prompt-registry.ts`) maps role names to prompt generation functions.

### Registration

Built-in prompts register on module import:

```typescript
registerPrompt('matt', (config) => getMattPrompt({ userProfile: config.userProfile }));
registerPrompt('kai', (config) => getKaiPrompt({ userProfile: config.userProfile }));
// ... 18 total built-in roles
```

### Resolution

```typescript
import { getPromptForRole } from '@automaker/prompts';

const prompt = getPromptForRole('matt', {
  projectPath: '/path/to/project',
  userProfile: profile,
});
```

Resolution order:

1. **Registered generator** — look up in the registry map
2. **Generic fallback** — `"You are a ${role} agent working on the project at ${config.projectPath}."`

### Custom prompts from templates

Agent templates in the role registry can include a `systemPromptTemplate` string. The `createPromptFromTemplate()` function converts these to generators:

```typescript
import { createPromptFromTemplate } from '@automaker/prompts';

const generator = createPromptFromTemplate(
  'You are a security reviewer for {{projectPath}}. Context: {{contextFiles}}'
);
```

Supports `{{projectPath}}` and `{{contextFiles}}` placeholders.

### Registered roles

18 roles are registered at startup:

| Category          | Roles                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generic templates | `product-manager`, `engineering-manager`, `frontend-engineer`, `backend-engineer`, `devops-engineer`, `qa-engineer`, `docs-engineer`, `gtm-specialist` |
| Named personas    | `ava`, `matt`, `sam`, `kai`, `frank`, `cindi`, `jon`                                                                                                   |
| Utility agents    | `pr-maintainer`, `board-janitor`, `linear-specialist`                                                                                                  |

## Default prompts

The defaults library (`libs/prompts/src/defaults.ts`) provides 12 categories of default prompts used throughout the application. These can be overridden by user customization in settings.

| Category            | Exported as                           | Purpose                                                                                        |
| ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Auto Mode           | `DEFAULT_AUTO_MODE_PROMPTS`           | Planning phases (lite, spec, full), feature templates, follow-up, continuation, pipeline steps |
| Agent Runner        | `DEFAULT_AGENT_PROMPTS`               | System prompt for interactive chat agents                                                      |
| Backlog Plan        | `DEFAULT_BACKLOG_PLAN_PROMPTS`        | Structured JSON plan generation for board modifications                                        |
| Enhancement         | `DEFAULT_ENHANCEMENT_PROMPTS`         | Improve, technical review, simplify, acceptance, UX review                                     |
| Commit Message      | `DEFAULT_COMMIT_MESSAGE_PROMPTS`      | Git commit message generation from diffs                                                       |
| Title Generation    | `DEFAULT_TITLE_GENERATION_PROMPTS`    | Feature title generation from descriptions                                                     |
| Issue Validation    | `DEFAULT_ISSUE_VALIDATION_PROMPTS`    | GitHub issue validation against codebase                                                       |
| Ideation            | `DEFAULT_IDEATION_PROMPTS`            | AI-powered brainstorming and suggestion generation                                             |
| App Spec            | `DEFAULT_APP_SPEC_PROMPTS`            | Project specification generation and feature extraction                                        |
| Context Description | `DEFAULT_CONTEXT_DESCRIPTION_PROMPTS` | File and image description for context files                                                   |
| Suggestions         | `DEFAULT_SUGGESTIONS_PROMPTS`         | Feature, refactoring, security, performance suggestions                                        |
| Task Execution      | `DEFAULT_TASK_EXECUTION_PROMPTS`      | Task execution, implementation instructions, learning extraction, PR feedback                  |

All defaults are accessible via `DEFAULT_PROMPTS` object:

```typescript
import { DEFAULT_PROMPTS } from '@automaker/prompts';

DEFAULT_PROMPTS.autoMode.planningLite;
DEFAULT_PROMPTS.taskExecution.implementationInstructions;
```

## Three-layer prompt resolution

For prompts that support user customization, the resolution order is:

```
User Override (settings) → Langfuse (versioned) → Hardcoded Default
```

1. **User Override** — If the user has customized a prompt in project or global settings, that takes priority
2. **Langfuse** — If Langfuse is configured and has a versioned prompt for this key, use it
3. **Hardcoded Default** — Fall back to the constant in `defaults.ts`

For details on Langfuse prompt management and versioning, see [Langfuse Prompt Management](../dev/langfuse-prompts.md).

## Writing effective prompts

Patterns distilled from the production defaults in `defaults.ts`:

### Structured output markers

Use machine-parseable markers to track progress:

```
"[SPEC_GENERATED] Please review the specification above."
"[TASK_START] T001: Description"
"[TASK_COMPLETE] T001: Brief summary"
"[PHASE_COMPLETE] Phase 1 complete"
```

The auto-mode system parses these markers to update feature status, track task progress, and detect completion. Without them, the system can't distinguish "agent is still working" from "agent is done."

### Verification gates

Require agents to prove their work:

```
## Verification Gates (MANDATORY)
1. Run `npm run build:server` and verify exit code 0
2. Run tests if any exist for the modified files
3. Run `git diff --stat` to confirm only intended files were changed
4. If you claim "tests pass" — paste the actual test output
5. If you claim "build succeeds" — paste the actual build output

DO NOT write your summary until all gates pass.
```

This prevents the "it should work" failure mode where agents claim success without evidence.

### Scope discipline

Explicitly constrain what agents should and shouldn't do:

```
Implement EXACTLY what the feature description says. Nothing more.
If the description says "create ServiceX", create ONLY ServiceX.
Do NOT create routes, modify index.ts, or wire it into the server
unless the description explicitly asks.
```

Over-delivery is the #1 cause of merge conflicts in multi-agent systems. Agent A creates a route that Agent B was supposed to create → conflict.

### Turn budgets

Prevent exploration spirals:

```
Do NOT spend more than 20% of your turns reading/exploring code.
If you're still reading files after 8 turns, you're behind schedule.
```

Without turn budgets, agents can spend 30+ turns "understanding the codebase" before writing a single line of code.

### Stuck detection

Tell agents when to stop:

```
If you have attempted 3+ fixes for the same error:
- STOP attempting more fixes
- Document what you tried and what happened each time
- Report this in your summary as a blocker
```

### Red flags

Explicitly name dangerous thought patterns:

```
STOP if you catch yourself thinking:
- "This should work" (without running it)
- "I'm confident this is correct" (confidence is not evidence)
- "The build will pass" (run it and prove it)
```

## Adding or modifying a prompt

### Modifying an existing persona prompt

1. Edit the prompt file in `libs/prompts/src/agents/{name}.ts`
2. Run `npm run build:packages` to rebuild
3. Test interactively: `/matt` (or the relevant skill) in Claude Code
4. Verify autonomous mode: start a test feature with the right domain

### Adding a new role prompt

1. Create `libs/prompts/src/agents/{role-name}.ts`
2. Export a prompt function: `export function getMyRolePrompt(config): string`
3. Register in `libs/prompts/src/prompt-registry.ts`:
   ```typescript
   registerPrompt('my-role', (config) => getMyRolePrompt({ ... }));
   ```
4. Run `npm run build:packages`
5. The role is now available via `getPromptForRole('my-role', config)`

### Modifying a default prompt

1. Find the constant in `libs/prompts/src/defaults.ts`
2. Edit the template string
3. Run `npm run build:packages`
4. Test the affected flow (e.g., auto-mode planning, commit message generation)

### Using Langfuse for prompt versioning

If Langfuse is configured, prompts can be versioned and A/B tested:

1. Create a prompt in the Langfuse dashboard
2. The server fetches the latest version on startup
3. User overrides still take priority over Langfuse versions

See [Langfuse Prompt Management](../dev/langfuse-prompts.md) for the full workflow.

## Prompt template variables

Auto-mode feature prompts support Handlebars-style variables:

| Variable                       | Source                  | Example                             |
| ------------------------------ | ----------------------- | ----------------------------------- |
| `{{featureId}}`                | Feature ID              | `abc-123`                           |
| `{{title}}`                    | Feature title           | `Add dark mode toggle`              |
| `{{description}}`              | Feature description     | Full markdown description           |
| `{{spec}}`                     | Generated specification | Task breakdown, acceptance criteria |
| `{{imagePaths}}`               | Attached images         | Array of file paths                 |
| `{{dependencies}}`             | Dependency list         | Comma-separated feature titles      |
| `{{verificationInstructions}}` | Custom verification     | Playwright test instructions        |
| `{{previousContext}}`          | Prior agent output      | Used in follow-up and continuation  |
| `{{prFeedback}}`               | PR review feedback      | Used in remediation loop            |
| `{{userFeedback}}`             | User-provided feedback  | Used in plan revisions              |

## Constraints system

Agent templates support a `constraints` object that adds safety rules to prompts:

| Constraint          | Effect                                |
| ------------------- | ------------------------------------- |
| `worktreeSafety`    | Injects `WORKTREE_SAFETY` fragment    |
| `portProtection`    | Injects `PORT_PROTECTION` fragment    |
| `processGuard`      | Injects `PROCESS_GUARD` fragment      |
| `monorepoStandards` | Injects `MONOREPO_STANDARDS` fragment |

These are rendered by `buildSystemPrompt()` in the agent factory. Templates can selectively enable constraints — a content agent might skip `monorepoStandards` while keeping `portProtection`.

## Related documentation

- [Agent Philosophy](./philosophy.md) — Why the prompt system is designed this way
- [Context System](./context-system.md) — How context files and memory flow into prompts
- [Dynamic Role Registry](./dynamic-role-registry.md) — Template-based agent creation
- [Langfuse Prompt Management](../dev/langfuse-prompts.md) — Versioned prompt management
- [Langfuse Integration](../dev/langfuse-integration.md) — Server-side tracing and cost tracking
