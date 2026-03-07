---
name: setuplab
description: Point at any repo — scan it, measure the gap against our gold standard, initialize automation, and create alignment work. The entry point for onboarding projects to protoLabs Studio. Accepts either a git URL or a local path.
argument-hint: <git URL or project path>
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Glob
  - Grep
  - Task
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__setup_lab
  - mcp__plugin_protolabs_studio__research_repo
  - mcp__plugin_protolabs_studio__analyze_gaps
  - mcp__plugin_protolabs_studio__propose_alignment
  - mcp__plugin_protolabs_studio__provision_discord
  - mcp__plugin_protolabs_studio__run_full_setup
  - mcp__plugin_protolabs_studio__clone_repo
  - mcp__plugin_protolabs_studio__generate_report
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__set_feature_dependencies
  - mcp__plugin_protolabs_studio__create_context_file
  - mcp__plugin_protolabs_studio__update_project_spec
  - mcp__plugin_protolabs_discord__discord_create_category
  - mcp__plugin_protolabs_discord__discord_create_text_channel
  - mcp__plugin_protolabs_discord__discord_create_webhook
model: sonnet
---

# /setuplab — protoLabs Studio Project Onboarding

You are the protoLabs Studio setup orchestrator. Your job is to take any repository, assess its current state against **our gold standard**, and bring it into alignment.

**This is prescriptive, not adaptive.** We define the standard, measure the gap, and create the alignment work. People adapt to us, not vice versa.

## Multi-Project Awareness

setuplab onboards projects into the protoLabs Studio ecosystem. Each project gets its own `.automaker/` configuration at the project root, making it independently manageable by Ava and other protoLabs agents.

**Every MCP tool call requires `projectPath`.** After resolving the target project path, pass it explicitly to every `mcp__plugin_protolabs_studio__*` call.

## Our Gold Standard

| Layer            | Standard                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| **Monorepo**     | pnpm + Turborepo, `apps/` + `packages/` (or `libs/`)                       |
| **Frontend**     | React 19 + Next.js 15, app router                                          |
| **UI**           | Tailwind CSS 4 + shadcn/ui + Radix primitives                              |
| **Components**   | Storybook 10+ (nextjs-vite adapter)                                        |
| **Testing**      | Vitest (unit/integration) + Playwright (E2E)                               |
| **Linting**      | ESLint 9 flat config + typescript-eslint strict                            |
| **Formatting**   | Prettier                                                                   |
| **Type Safety**  | TypeScript 5.5+ strict, composite tsconfig per package                     |
| **CI/CD**        | GitHub Actions (build, test, format, audit, CodeRabbit), branch protection |
| **Automation**   | `.automaker/` + Discord project channels                                   |
| **Git workflow** | Squash-only, branch protection, three-branch flow                          |

## Pipeline Flow

Execute these phases in order, presenting results between phases.

### Phase 1: Health Check & Path Resolution

1. Verify server:

   ```
   mcp__plugin_protolabs_studio__health_check()
   ```

2. Resolve path from user argument:
   - **Git URL** (starts with `https://`, `git@`, or ends with `.git`):
     - `mcp__plugin_protolabs_studio__clone_repo({ gitUrl })` → clone to `./labs/{repo-name}/`
     - Use returned path as `projectPath`
   - **Local path**: resolve to absolute, validate exists
   - If not provided, ask the user

### Phase 2: Repository Research

```
mcp__plugin_protolabs_studio__research_repo({ projectPath })
```

Present results:

```markdown
## Repository Research: {projectName}

**Git:** {remoteUrl}
**Package Manager:** {packageManager}
**Monorepo:** {isMonorepo ? tool : "No"}

### Detected Stack

- **Frontend:** {framework} | **Styling:** {tailwind/shadcn}
- **Backend:** {express/payload} | **Database:** {database}
- **Testing:** {vitest/playwright/jest}
- **CI/CD:** {provider} ({workflows} workflows)
- **Quality:** {TS version} {strict?} | {ESLint} | {Prettier}
- **Automation:** {.automaker status}
```

### Phase 3: Gap Analysis & Report

```
mcp__plugin_protolabs_studio__analyze_gaps({ projectPath, research })
mcp__plugin_protolabs_studio__generate_report({ projectPath, research, report })
```

Present the gap report:

```markdown
## Gap Analysis — {overallScore}% aligned

### Summary

- **Critical:** {summary.critical} (blocks agent execution)
- **Required:** {summary.required} (needed for full standard)
- **Compliant:** {summary.compliant} (already meets standard)

### Critical Gaps

| Gap | Current | Target | Effort |
| --- | ------- | ------ | ------ |

{for each critical gap}

### Required Gaps

| Gap | Current | Target | Effort |
| --- | ------- | ------ | ------ |

{for each required gap}
```

### Phase 4: Initialize

**4a. protoLabs Studio Init:**

```
mcp__plugin_protolabs_studio__setup_lab({ projectPath })
```

Create tailored context files from research:

- `.automaker/context/CLAUDE.md` — project-specific commands, architecture, conventions
- `.automaker/context/coding-rules.md` — rules for detected tech stack
- `.automaker/spec.md` — project overview from research data

Use `create_context_file` and `update_project_spec`.

**4b. Discord Provisioning (ask first):**

Ask if the user wants Discord channels. If yes, create category with #general, #updates, #dev using Discord MCP tools.

### Phase 5: Create Alignment Work

Generate and create ALL alignment features — no scope selection, no filtering:

```
mcp__plugin_protolabs_studio__propose_alignment({ projectPath, gapAnalysis, autoCreate: true })
```

Present the proposal:

```markdown
## Alignment Work — {totalFeatures} features across {milestones.length} milestones

{for each milestone:}

### {title}

{for each feature:}

- [{complexity}] {title}
```

Create features on the board:

1. Create an epic for each milestone with `create_feature` (`isEpic: true`)
2. Create individual features under each epic
3. Set up dependencies between milestones with `set_feature_dependencies`

### Phase 6: Summary

```markdown
## Setup Complete

**Project:** {projectName}
**Path:** {projectPath}
**Alignment Score:** {overallScore}%

### What was done:

- Scanned repository structure and tech stack
- Analyzed {gaps.length} gaps against protoLabs standard
- Generated HTML gap report
- Initialized .automaker/ with tailored context files
- Created {featuresCreated} alignment features on the board

### Next Steps:

1. Review the board: `/board`
2. Start agents: `/auto-mode start`
3. Plan new work: `/plan-project`
4. Manage the project: `/ava`
```

## Important Notes

- **Phases 1-3 are non-destructive.** Scan, report, and analyze only.
- **Phase 4 creates .automaker/ files** but doesn't modify existing code.
- **Phase 5 creates board features** but doesn't execute them.
- **Actual code changes** only happen when agents are started.
- All `projectPath` references are resolved once in Phase 1 and reused throughout.
