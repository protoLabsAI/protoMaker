/**
 * Starter Kit Context Files
 *
 * Returns the content of .automaker/CONTEXT.md for each starter kit type.
 * Scaffolding tools write these to the project root so agents understand
 * the project's framework, routing, and conventions.
 */

/**
 * Get the agent context file content for the Starlight docs starter kit.
 * Write this to `.automaker/CONTEXT.md` in the new project.
 */
/**
 * Get the agent context file content for the portfolio starter kit.
 * Write this to `.automaker/CONTEXT.md` in the new project.
 */
export function getPortfolioStarterContext(): string {
  return `# Portfolio Starter Kit — Agent Context

This project is a **personal portfolio site** built with Astro 5, React 19, and Tailwind CSS v4.

## Project Structure

\`\`\`
src/
  content/
    blog/          ← Blog posts (MDX)
    projects/      ← Portfolio project entries (MDX)
    testimonials/  ← Testimonial entries (MDX)
    siteConfig/    ← Site-level config: author info, nav, socials
    docs/          ← Internal agent docs and conventions
  components/      ← Astro + React components
  layouts/         ← Page layouts (BaseLayout, BlogLayout, etc.)
  pages/           ← File-based routes
  styles/          ← Global CSS and design tokens
astro.config.mjs   ← Astro config (site URL, integrations)
\`\`\`

## Content Collections

All content uses Astro's **content collections** via \`src/content/config.ts\`:

- \`blog\` — blog posts with \`title\`, \`date\`, \`description\`, optional \`tags\`
- \`projects\` — portfolio projects with \`title\`, \`description\`, \`tech\`, \`links\`
- \`testimonials\` — quotes with \`author\`, \`role\`, \`company\`
- \`siteConfig\` — a single \`index.mdx\` with site-level metadata

## Page Routes

| File | Route |
|------|-------|
| \`src/pages/index.astro\` | \`/\` (home — Hero, Projects, About, Testimonials) |
| \`src/pages/blog/index.astro\` | \`/blog\` |
| \`src/pages/blog/[slug].astro\` | \`/blog/:slug\` |
| \`src/pages/contact.astro\` | \`/contact\` |
| \`src/pages/rss.xml.ts\` | \`/rss.xml\` |

## Theming

Design tokens live in \`src/styles/global.css\` as CSS custom properties and a Tailwind v4 \`@theme\` block:

\`\`\`css
@theme {
  --color-accent: oklch(62% 0.25 264);
}
\`\`\`

## Commands

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start local dev server at localhost:4321 |
| \`npm run build\` | Build production site to \`dist/\` |
| \`npm run preview\` | Preview the production build |
| \`npm run format\` | Format all files with Prettier |
| \`npm run format:check\` | Check formatting (used in CI) |

## Key Constraints

- React is used for interactive islands only (contact form, mobile menu). Most components are \`.astro\`.
- Tailwind v4 is configured via the Vite plugin (\`@tailwindcss/vite\`) — no \`tailwind.config.js\` file.
- \`*.astro\` files are excluded from Prettier — \`prettier-plugin-astro\` is installed locally.
- Blog posts and project pages use MDX — you can embed React components directly in content.
- RSS feed at \`/rss.xml\` is auto-generated from the \`blog\` collection.
`;
}

/**
 * Get the agent context file content for the AI Agent App starter kit.
 * Write this to `.automaker/CONTEXT.md` in the new project.
 */
export function getAiAgentAppStarterContext(): string {
  return `# AI Agent App Starter Kit — Agent Context

This project is an **AI agentic chat application** with a multi-package monorepo structure.

## Project Structure

\`\`\`
packages/
  server/    ← Express server with Anthropic agentic loop (POST /chat)
  ui/        ← Vite + React + TanStack Router chat UI with streaming
  tools/     ← Shared tool definitions (MCP, LangGraph, Express adapters)
  flows/     ← LangGraph workflow definitions
  prompts/   ← Prompt registry with YAML frontmatter + {{variable}} templates
  tracing/   ← Langfuse + FileTracer observability (zero-dependency fallback)
  app/       ← Cross-package app entrypoint
\`\`\`

## Key Patterns

### Tools
Tools are defined once with \`defineSharedTool\` and deployed to MCP, LangGraph, and Express via adapters. Register tools via \`registerTool()\` in the ToolRegistry. Use \`toolProgress.emit()\` to broadcast live progress to the UI over WebSocket sideband (port 3002).

### Chat Server
The agentic loop lives in \`packages/server/src/routes/chat.ts\`. It calls Anthropic, detects \`tool_use\` blocks, executes via ToolRegistry, feeds results back, and repeats until \`end_turn\`. Streaming uses the Vercel AI SDK (\`streamText\` → \`pipeUIMessageStreamToResponse\`).

### Flows
LangGraph flows live in \`packages/flows/src/flows/\`. Use \`createLinearGraph\`, \`createLoopGraph\`, or \`createBranchingGraph\` factory functions. State reducers (\`appendReducer\`, \`counterReducer\`, etc.) handle state merging.

### Prompts
Prompts are Markdown files in \`packages/prompts/src/prompts/\` with YAML frontmatter. Load via \`PromptLoader\` and register in \`PromptRegistry\`. Slash commands expand via system-prompt prepending.

### Tracing
Pass \`LANGFUSE_PUBLIC_KEY\` + \`LANGFUSE_SECRET_KEY\` to enable Langfuse. Fallback: \`FileTracer\` writes JSON traces to \`packages/tracing/traces/\`.

## Commands

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start server (port 3001) + UI dev server (port 5173) |
| \`npm run build\` | Build all packages |
| \`npm run typecheck\` | TypeScript check across all packages |
| \`npm run test\` | Run Vitest test suite |

## Key Constraints

- Server port: 3001. UI dev server: 5173. WebSocket sideband: 3002.
- Zero \`@protolabsai/*\` internal imports — this package is standalone.
- CSS theming uses \`bg-[var(--primary)]\` Tailwind arbitrary syntax (no design system dependency).
- \`@@PROJECT_NAME\` placeholders in package names should be replaced with your project name.
`;
}

/**
 * Get the agent context file content for the Starlight docs starter kit.
 * Write this to `.automaker/CONTEXT.md` in the new project.
 */
export function getDocsStarterContext(): string {
  return `# Docs Starter Kit — Agent Context

This project is a **Starlight documentation site** built with Astro 5 and Starlight 0.37.

## Project Structure

\`\`\`
src/
  content/
    docs/          ← All documentation pages live here
      index.mdx    ← Root page (maps to /)
      guides/      ← How-to guides
      reference/   ← Reference pages
      tutorials/   ← Step-by-step tutorials
  styles/
    global.css     ← Theme overrides (CSS variables + Tailwind v4 @theme block)
  content.config.ts ← Collection schema (docsLoader + docsSchema)
  assets/          ← Images and static files
astro.config.mjs   ← Starlight + Astro config
\`\`\`

## Content Collections

All docs use Astro's **content collections** via \`src/content.config.ts\`. The \`docs\` collection uses Starlight's \`docsLoader()\` and \`docsSchema()\`:

\`\`\`ts
import { defineCollection } from 'astro:content';
import { docsLoader, docsSchema } from '@astrojs/starlight/loaders';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
\`\`\`

## Page Frontmatter

Every \`.mdx\` / \`.md\` file in \`src/content/docs/\` requires at minimum:

\`\`\`yaml
---
title: Page Title
description: Short description for SEO and sidebar tooltips
---
\`\`\`

Optional fields: \`sidebar\` (label, order, badge, hidden), \`hero\`, \`tableOfContents\`, \`editUrl\`, \`prev\`, \`next\`.

## Routing

Starlight auto-generates routes from the file tree:
- \`src/content/docs/index.mdx\` → \`/\`
- \`src/content/docs/guides/add-a-page.mdx\` → \`/guides/add-a-page/\`
- \`src/content/docs/reference/configuration.mdx\` → \`/reference/configuration/\`

## Theming

Theme customization lives in \`src/styles/global.css\`. Starlight exposes \`--sl-*\` CSS variables. Override them inside a \`[data-theme='light']\` or \`[data-theme='dark']\` selector, or globally:

\`\`\`css
:root {
  --sl-color-accent: 124, 58, 237;  /* violet accent */
}
\`\`\`

A Tailwind v4 \`@theme\` block can also be added for utility classes.

## Commands

| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start local dev server |
| \`npm run build\` | Build production site to \`dist/\` |
| \`npm run preview\` | Preview the production build |
| \`npm run format\` | Format all files with Prettier |
| \`npm run format:check\` | Check formatting (used in CI) |
| \`npm run lint:md\` | Lint markdown/MDX content with markdownlint-cli2 |

## CI/CD

\`.github/workflows/ci.yml\` runs **build**, **format**, and **lint** jobs on every PR and push to \`main\`. On merge to \`main\`, a **deploy** job pushes to Cloudflare Pages using \`CLOUDFLARE_API_TOKEN\` and \`CLOUDFLARE_ACCOUNT_ID\` secrets.

## Key Constraints

- Starlight is pinned to \`^0.37.0\` (last Astro 5-compatible release). Do not upgrade to 0.38+ without also upgrading Astro to v6.
- Zod is pinned to \`^3.25.0\` because Starlight 0.37 requires Zod v3 (monorepo root has v4).
- \`*.astro\` files are excluded from Prettier — \`prettier-plugin-astro\` is installed locally but not at the monorepo root.
- New pages go in \`src/content/docs/\`. Do not create pages in \`src/pages/\` — Starlight handles routing.
- Search is powered by Pagefind, auto-enabled at build time. No config required.
`;
}
