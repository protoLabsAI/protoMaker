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
