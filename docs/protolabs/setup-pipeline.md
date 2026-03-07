# Setup Pipeline Technical Reference

## Overview

The `/setuplab` command is the entry point for onboarding any repository to protoLabs. It runs a 5-phase pipeline that scans, analyzes, initializes, proposes, and (on approval) executes alignment work.

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
    │ (6 new tools) │ │ MCP      │ │ protoLabs   │
    │               │ │ Plugin   │ │ MCP Tools   │
    └────────┬──────┘ └──────────┘ └─────────────┘
             │
    ┌────────▼──────────────────────────────────┐
    │              protoLabs Server              │
    │                                            │
    │  POST /api/setup/research     → Phase 1   │
    │  POST /api/setup/gap-analysis → Phase 2   │
    │  POST /api/setup/project      → Phase 3   │
    │  POST /api/setup/propose      → Phase 4   │
    │                                            │
    │  Services:                                 │
    │  - repo-research-service (heuristic scan)  │
    │    exports: researchRepo                   │
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
| `provision_discord` | Create Discord channels                     | 3     |
| `propose_alignment` | Convert gaps to board features              | 4     |
| `run_full_setup`    | Chain all phases (convenience)              | 1-4   |

## Types

All types are in `libs/types/src/setup.ts` and exported from `@protolabsai/types`.

### Key Types

Setup pipeline types are in `libs/types/src/setup.ts`, project types in `libs/types/src/project.ts`, and proto.config types in `libs/types/src/proto-config.ts`. All are exported from `@protolabsai/types`.

- `RepoResearchResult` — Everything detected about a repo. Key sections:
  - `git` — isRepo, remoteUrl, defaultBranch, provider
  - `monorepo` — isMonorepo, tool, packageManager, workspaceGlobs, packages
  - `frontend` — framework, metaFramework, hasShadcn, hasTailwind, hasRadix, hasStorybook
  - `backend` — hasPayload, database, hasExpress, hasFastAPI
  - `agents` — hasMCPServers, mcpPackages, hasLangGraph, hasClaudeSDK, hasAgentFolder
  - `testing` — hasVitest, hasPlaywright, hasJest, hasPytest, testDirs
  - `codeQuality` — hasESLint, hasPrettier, hasTypeScript, tsStrict, hasCompositeConfig, hasHusky, hasLintStaged
  - `ci` — hasCI, provider, workflows, hasBuildCheck, hasTestCheck, hasFormatCheck, hasSecurityAudit, **hasCodeRabbit**, **hasBranchProtection** (checks both legacy protection and modern rulesets via `gh` CLI)
  - `automation` — hasAutomaker, hasDiscordIntegration, hasProtolabConfig, hasAnalytics, **analyticsProvider** (umami | plausible | google-analytics | other)
  - `python` — hasPythonServices, services, hasRuff, hasBlack, hasPytest, hasPoetry
  - `scripts` — raw scripts from root `package.json` (used to populate `proto.config.yaml` commands)
  - `structure` — topDirs, configFiles, entryPoints
- `GapAnalysisReport` — Gaps and compliance items with an alignment score
- `GapItem` — A single gap with severity, current state, target state, and effort estimate
- `AlignmentProposal` — Milestones with features ready for board creation
- `ProtolabConfig` — The `protolab.config` JSON file schema
- `ProtoConfig` — The `proto.config.yaml` file schema (from `libs/types/src/proto-config.ts`); loader/writer in `@protolabsai/platform` (`loadProtoConfig`, `writeProtoConfig`)
- `DiscordChannelMapping` — Association between a project slug and its Discord category/channels (in `libs/types/src/project.ts`)

## Templates

Templates live in `apps/server/src/templates/` and fall into two categories:

### CI/CD Templates (`templates/cicd/`)

File-based templates applied during gap remediation workflows:

- `github-actions/build.yml` — pnpm install + build
- `github-actions/test.yml` — pnpm test
- `github-actions/format-check.yml` — prettier --check
- `github-actions/security-audit.yml` — pnpm audit
- `branch-protection/main.json` — Standard ruleset

### Context File Generation (Phase 3)

Context files are **generated programmatically** by `POST /api/setup/project` — not via file-based template interpolation. The `apps/server/src/templates/context/` directory contains reference templates used as structural guides during development; the route generates content dynamically from research data.

**Directory structure created:**

```
<project>/
├── .automaker/
│   ├── features/       # Feature files
│   ├── context/        # CLAUDE.md, coding-rules.md
│   ├── memory/         # Agent learning files
│   └── .backups/       # Backup files
├── protolab.config     # JSON config (name, version, protolab.enabled)
└── proto.config.yaml   # YAML config (tech stack, commands, git)
```

Files generated by the project setup route:

| File                                 | Generator                                                                                | Notes                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `.automaker/context/CLAUDE.md`       | `generateClaudeMd()` in `project.ts`                                                     | Tech-stack-aware; falls back to generic if no research                       |
| `.automaker/context/coding-rules.md` | `generateCodingRules()` in `project.ts`                                                  | **Conditional** — only generated if TypeScript/ESLint/Prettier/Ruff detected |
| `proto.config.yaml`                  | `buildProtoConfig()` in `project.ts` + `writeProtoConfig()` from `@protolabsai/platform` | Maps detected stack to YAML schema                                           |
| `protolab.config`                    | Inline in `project.ts`                                                                   | JSON with name, version, protolab.enabled flag                               |

All files are **non-destructive**: if the file already exists it is skipped (preserves manual edits).

After file creation, the project is also **added to global settings** (`settingsService.updateGlobalSettings`) so it appears in the Automaker project list immediately.

## Gap Checks

### Critical (agents can't work without)

- `.automaker/` exists
- TypeScript strict mode + composite configs
- Testing framework (Vitest)
- CI pipeline (GitHub Actions with build+test+format+audit)
- Branch protection (squash-only, required checks, `required_review_thread_resolution: true`, NO bypass actors — everyone must go through PRs)
- Package manager (pnpm)

### Required (full automation)

- Turborepo
- Prettier
- Storybook
- shadcn/ui
- Tailwind CSS 4
- Playwright E2E
- ESLint 9 flat config
- Pre-commit hooks (Husky + lint-staged)
- Discord channels
- CodeRabbit (strict profile — never use chill)
- Umami analytics (privacy-friendly traffic tracking)
- Payload CMS (conditional — only for projects with a database backend)
- MCP servers (domain-specific tools in `packages/`)
- Agent SDK (Claude Agent SDK or LangGraph)
- Python: Ruff, pytest (conditional — only for repos with Python services)

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
