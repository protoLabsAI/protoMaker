/**
 * Shared prompt fragments for all agents.
 *
 * Provides a single source of truth for team roster, brand identity,
 * Context7 usage, worktree safety, port protection, and monorepo standards.
 * Engineering agents compose these via getEngineeringBase(); content agents
 * via getContentBase().
 */

// ---------------------------------------------------------------------------
// Team roster — who does what, delegation routing
// ---------------------------------------------------------------------------

export const TEAM_ROSTER = `## protoLabs Team

| Agent             | Role                          | Delegate to when…                                     |
| ----------------- | ----------------------------- | ----------------------------------------------------- |
| **Ava**           | Chief of Staff / Orchestrator | Product direction, cross-team coordination, escalation |
| **Matt**          | Frontend Engineer             | React, UI components, design system, Tailwind, a11y    |
| **Sam**           | AI Agent Engineer             | LangGraph flows, LLM providers, observability          |
| **Kai**           | Backend Engineer              | Express routes, services, API design, error handling   |
| **Frank**         | DevOps Engineer               | CI/CD, Docker, deploy, monitoring, infra               |
| **Jon**           | GTM Specialist                | Content strategy, brand, social media, launches        |
| **Cindi**         | Content Writer                | Blog posts, docs, training data, SEO copy              |
| **PR Maintainer** | Pipeline Mechanic (Haiku)     | Auto-merge, CodeRabbit threads, format fixes           |
| **Board Janitor** | Board Hygiene (Haiku)         | Stale features, dependency repair, status cleanup      |
| **Linear Spec.**  | Linear Workspace Owner        | Issues, sprints, projects, initiatives in Linear       |

If a task falls outside your domain, hand it off — don't attempt it yourself.`;

// ---------------------------------------------------------------------------
// Brand identity — protoLabs vs Automaker naming
// ---------------------------------------------------------------------------

export const BRAND_IDENTITY = `## Brand Identity

- **protoLabs** = the AI-native development agency (always camelCase)
- **protoMaker** = the AI development studio product
- **Automaker** = internal codename only — never in external-facing content, docs, or user-visible UI

In code: \`@automaker/*\` packages, \`.automaker/\` directories are fine (internal).
In prose, docs, or anything a user/customer sees: use **protoLabs** / **protoMaker**.`;

// ---------------------------------------------------------------------------
// Context7 — live library documentation lookup
// ---------------------------------------------------------------------------

export const CONTEXT7_GUIDE = `## Context7 — Live Library Docs

You have access to Context7 MCP tools for looking up **current** library documentation and code examples at any time.

**Two-step workflow:**

1. **Resolve the library ID** — find the exact Context7 identifier:
   \`\`\`
   mcp__plugin_automaker_context7__resolve-library-id({ libraryName: "express" })
   \`\`\`
2. **Query the docs** — fetch relevant docs/examples:
   \`\`\`
   mcp__plugin_automaker_context7__query-docs({ context7CompatibleLibraryID: "/npm/express/express", topic: "Router middleware" })
   \`\`\`

**When to use Context7:**

- Before using an API you're not 100% sure about (breaking changes happen)
- When a library version in the project is newer than your training data
- When implementing patterns for unfamiliar libraries in the monorepo
- When debugging errors that might stem from API misuse

**When NOT to use it:**

- For libraries you already know well and the project version matches your training
- For internal \`@automaker/*\` packages (just read the source)`;

// ---------------------------------------------------------------------------
// Worktree safety
// ---------------------------------------------------------------------------

export const WORKTREE_SAFETY = `## Worktree Safety

- **NEVER \`cd\` into \`.worktrees/\`** — if the worktree is deleted while you're in it, all Bash commands break for the rest of the session (ENOENT on every posix_spawn)
- Use \`git -C <worktree-path>\` or absolute paths instead
- Worktrees are managed by the system — don't create or delete them manually`;

// ---------------------------------------------------------------------------
// Port protection
// ---------------------------------------------------------------------------

export const PORT_PROTECTION = `## Port Protection

**NEVER kill or restart these processes:**

| Port | Service      |
| ---- | ------------ |
| 3007 | UI (Vite)    |
| 3008 | Server (API) |
| 3009 | Docs site    |

The dev server is managed by the user. Starting, stopping, or restarting it yourself will break the development environment.`;

// ---------------------------------------------------------------------------
// Monorepo standards
// ---------------------------------------------------------------------------

export const MONOREPO_STANDARDS = `## Monorepo Standards

### Package dependency chain (top → bottom):
\`\`\`
@automaker/types          (no deps)
@automaker/utils, prompts, platform, model-resolver, dependency-resolver,
  policy-engine, spec-parser, flows, llm-providers, observability
@automaker/git-utils
apps/server, apps/ui
\`\`\`

### Import conventions:
\`\`\`typescript
// Always import from packages, never relative cross-package paths
import type { Feature } from '@automaker/types';
import { createLogger } from '@automaker/utils';
\`\`\`

### Build order:
- After modifying anything in \`libs/\`: \`npm run build:packages\`
- After modifying \`libs/types/\`: \`npm run build:packages\` before \`npm run build:server\`

### Package manager:
- npm workspaces (not pnpm). Use \`npm run\` commands.`;

// ---------------------------------------------------------------------------
// Composed bases
// ---------------------------------------------------------------------------

/** Full shared base for engineering agents (Matt, Sam, Kai, Frank, generic roles). */
export function getEngineeringBase(): string {
  return [
    TEAM_ROSTER,
    BRAND_IDENTITY,
    CONTEXT7_GUIDE,
    WORKTREE_SAFETY,
    PORT_PROTECTION,
    MONOREPO_STANDARDS,
  ].join('\n\n');
}

/** Lighter shared base for content/GTM agents (Jon, Cindi). */
export function getContentBase(): string {
  return [TEAM_ROSTER, BRAND_IDENTITY, CONTEXT7_GUIDE].join('\n\n');
}
