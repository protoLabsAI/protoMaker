/**
 * CLAUDE.md Fragment Builders
 *
 * Composable sections for building CLAUDE.md files.
 * Each function returns a string fragment that can be assembled
 * by the caller (create-protolab, setuplab, or starter kit).
 */

import type { ClaudeMdOptions } from './types.js';

/**
 * Base CLAUDE.md header with project name and structure skeleton.
 */
export function getBaseClaudeMd({ projectName }: ClaudeMdOptions): string {
  return `# ${projectName}

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

${projectName} is managed with protoLabs Studio.
`;
}

/**
 * Git workflow section — three-branch flow guidance.
 */
export function getGitWorkflowSection(): string {
  return `## Git Workflow

This repo uses a three-branch environment-pinned flow:

\`\`\`
feature/* --> dev --> staging --> main
\`\`\`

- **dev** — active development. Feature branches PR here.
- **staging** — integration / QA. PR from dev only.
- **main** — stable release. PR from staging only.

Rules:
- Never push directly to main or staging. Always use a PR.
- Feature PRs target dev.
- Promotion PRs (dev->staging, staging->main) use merge commits, never squash.
`;
}

/**
 * Agent guidelines section — rules for AI agent behavior.
 */
export function getAgentGuidelinesSection(): string {
  return `## Agent Guidelines

- Follow the coding standards defined in coding-rules.md
- Write tests for new functionality
- Keep code clean, typed, and maintainable
- Use the established patterns in the codebase
- Run the build before committing to catch type errors
- Do not introduce new dependencies without justification
- Prefer editing existing files over creating new ones
`;
}

/**
 * Common commands section for docs-type projects.
 */
export function getDocsCommandsSection(): string {
  return `## Common Commands

\`\`\`bash
npm run dev           # Start dev server with hot reload
npm run build         # Production build
npm run preview       # Preview production build locally
npm run format        # Format with Prettier
npm run format:check  # Check formatting
npm run lint:md       # Lint markdown files
\`\`\`
`;
}

/**
 * Common commands section for portfolio-type projects (Astro + React).
 */
export function getPortfolioCommandsSection(): string {
  return `## Common Commands

\`\`\`bash
npm install           # Install dependencies (run inside portfolio directory)
npm run dev           # Start dev server at localhost:4321
npm run build         # Production build (static output to dist/)
npm run preview       # Preview production build locally
npm run format        # Format with Prettier (including .astro files)
npm run format:check  # Check formatting (used in CI)
\`\`\`

## Project Structure

\`\`\`
src/
  components/        # Astro section components + React islands
  content/           # Content Collections (projects, blog, testimonials)
  layouts/           # Base HTML layout (Layout.astro)
  pages/             # Astro pages → file-based routing
  styles/            # global.css with Tailwind v4 @theme tokens
  content.config.ts  # Content Collection schemas
dist/                # Production build output (gitignored)
\`\`\`

## Content Collections

Add portfolio entries by creating files in \`src/content/\`:

- \`src/content/projects/\` — project cards shown in ProjectGrid
- \`src/content/blog/\` — blog posts with dynamic routes

Schemas are defined in \`src/content.config.ts\`. Run \`npm run build\` after adding entries to validate frontmatter.
`;
}

/**
 * Common commands section for extension-type projects.
 */
export function getExtensionCommandsSection(): string {
  return `## Common Commands

\`\`\`bash
pnpm install          # Install dependencies
pnpm dev              # Chrome dev mode (auto-reload)
pnpm dev:firefox      # Firefox dev mode
pnpm build            # Chrome production build
pnpm build:firefox    # Firefox production build
pnpm zip:all          # Zip for both stores
pnpm typecheck        # Type checking
pnpm lint             # ESLint + web-ext lint
pnpm format           # Prettier
pnpm test             # Unit tests
pnpm test:e2e         # E2E tests
\`\`\`
`;
}
