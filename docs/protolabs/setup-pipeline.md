# Setup Pipeline Technical Reference

## Overview

The `/setuplab` command is the entry point for onboarding any repository to ProtoLabs. It runs a 5-phase pipeline that scans, analyzes, initializes, proposes, and (on approval) executes alignment work.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   /setuplab Skill                        │
│              (Orchestration Layer)                        │
│    Chains MCP tools, presents results, asks for input    │
└────────────┬────────────┬────────────┬──────────────────┘
             │            │            │
    ┌────────▼──────┐ ┌──▼───────┐ ┌──▼──────────┐
    │ MCP Server    │ │ Discord  │ │ Existing    │
    │ (6 new tools) │ │ MCP      │ │ Automaker   │
    │               │ │ Plugin   │ │ MCP Tools   │
    └────────┬──────┘ └──────────┘ └─────────────┘
             │
    ┌────────▼──────────────────────────────────┐
    │              Automaker Server              │
    │                                            │
    │  POST /api/setup/research     → Phase 1   │
    │  POST /api/setup/gap-analysis → Phase 2   │
    │  POST /api/setup/project      → Phase 3   │
    │  POST /api/setup/beads        → Phase 3   │
    │  POST /api/setup/propose      → Phase 4   │
    │                                            │
    │  Services:                                 │
    │  - RepoResearchService (heuristic scan)    │
    │  - GapAnalysisService (standard comparison)│
    │  - AlignmentProposalService (gap→features) │
    └────────────────────────────────────────────┘
```

## MCP Tools

| Tool                | Description                                 | Phase |
| ------------------- | ------------------------------------------- | ----- |
| `research_repo`     | Scan repo structure, detect tech stack      | 1     |
| `analyze_gaps`      | Compare against gold standard               | 2     |
| `setup_lab`         | Initialize .automaker/ (existing, enhanced) | 3     |
| `setup_beads`       | Initialize .beads/ task tracker             | 3     |
| `provision_discord` | Create Discord channels                     | 3     |
| `propose_alignment` | Convert gaps to board features              | 4     |
| `run_full_setup`    | Chain all phases (convenience)              | 1-4   |

## Types

All types are in `libs/types/src/setup.ts` and exported from `@automaker/types`.

### Key Types

- `RepoResearchResult` — Everything detected about a repo (git, monorepo, frontend, backend, testing, CI, etc.)
- `GapAnalysisReport` — Gaps and compliance items with an alignment score
- `GapItem` — A single gap with severity, current state, target state, and effort estimate
- `AlignmentProposal` — Milestones with features ready for board creation
- `ProtolabConfig` — The `protolab.config` file schema

## Templates

Templates live in `apps/server/src/templates/` and are used during Phase 3 (Initialize) to generate context files tailored to the detected tech stack.

### CI/CD Templates (`templates/cicd/`)

- `github-actions/build.yml` — pnpm install + build
- `github-actions/test.yml` — pnpm test
- `github-actions/format-check.yml` — prettier --check
- `github-actions/security-audit.yml` — pnpm audit
- `branch-protection/main.json` — Standard ruleset

### Context Templates (`templates/context/`)

- `claude-md/base.md` — Base CLAUDE.md for any project
- `claude-md/monorepo.md` — Monorepo-specific section
- `claude-md/react.md` — React-specific section
- `claude-md/python.md` — Python service section
- `coding-rules/typescript.md` — TypeScript rules
- `coding-rules/react.md` — React rules
- `coding-rules/python.md` — Python rules
- `spec.md` — Project specification template

Templates use `{{variable}}` interpolation.

## Gap Checks

### Critical (agents can't work without)

- `.automaker/` exists
- TypeScript strict mode + composite configs
- Testing framework (Vitest)
- CI pipeline (GitHub Actions with build+test+format+audit)
- Branch protection (squash-only, required checks, `required_review_thread_resolution: true`, NO bypass actors — everyone must go through PRs)
- Package manager (pnpm)

### Recommended (full automation)

- Turborepo
- Prettier
- Storybook
- shadcn/ui
- Playwright E2E
- ESLint 9 flat config
- Pre-commit hooks (Husky + lint-staged)
- VitePress docs site (`docs/` directory with auto-generated sidebar)
- Beads task tracker
- Discord channels
- CodeRabbit (strict profile — never use chill)
- Umami analytics (privacy-friendly traffic tracking)

### Optional

- Payload CMS
- MCP servers
- Agent SDK
- Python: Ruff, pytest

## File Manifest

### New Files

| File                                                       | Purpose                      |
| ---------------------------------------------------------- | ---------------------------- |
| `libs/types/src/setup.ts`                                  | All setup pipeline types     |
| `apps/server/src/services/repo-research-service.ts`        | Heuristic repo scanning      |
| `apps/server/src/services/gap-analysis-service.ts`         | Gap comparison engine        |
| `apps/server/src/services/alignment-proposal-service.ts`   | Gap-to-feature conversion    |
| `apps/server/src/routes/setup/routes/research.ts`          | Research route handler       |
| `apps/server/src/routes/setup/routes/gap-analysis.ts`      | Gap analysis route handler   |
| `apps/server/src/routes/setup/routes/propose.ts`           | Proposal route handler       |
| `apps/server/src/routes/setup/routes/discord-provision.ts` | Discord provisioning handler |
| `apps/server/src/routes/setup/routes/beads.ts`             | Beads init handler           |
| `apps/server/src/templates/cicd/**`                        | CI/CD workflow templates     |
| `apps/server/src/templates/context/**`                     | Context file templates       |
| `docs/protolabs/setup-pipeline.md`                         | This file                    |

### Modified Files

| File                                                         | Change                |
| ------------------------------------------------------------ | --------------------- |
| `libs/types/src/index.ts`                                    | Export setup types    |
| `apps/server/src/routes/setup/index.ts`                      | Register 5 new routes |
| `packages/mcp-server/src/index.ts`                           | Add 6 new MCP tools   |
| `packages/mcp-server/plugins/automaker/commands/setuplab.md` | Full rewrite          |
