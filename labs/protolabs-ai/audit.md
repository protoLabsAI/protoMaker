# ProtoLabs Setup Audit — protolabs.ai

**Project**: protolabs.ai (marketing site + CMS)
**Repo**: `git@github.com:proto-labs-ai/protolabs.ai.git`
**Path**: `/Users/kj/dev/protolabs-ai`
**Started**: 2026-02-13
**Operator**: Ava Loveland (CoS)

---

## Phase 1: Repository Research

**Date**: 2026-02-13
**Tool**: `research_repo`
**Result**: Scan complete (pure heuristics, no AI)

### Detected Stack

| Category            | Finding                                     |
| ------------------- | ------------------------------------------- |
| **Framework**       | Next.js 15.4.11 + React 19.2.1              |
| **CMS**             | Payload 3.76.0                              |
| **Package Manager** | pnpm                                        |
| **Monorepo**        | No (single package)                         |
| **Styling**         | Tailwind CSS 4.1.18                         |
| **Components**      | shadcn/ui (components.json present)         |
| **TypeScript**      | 5.7.3, strict: true                         |
| **Testing**         | Vitest 4.0.18 + Playwright 1.56.1           |
| **Linting**         | ESLint 9.16.0 (flat config) + Prettier      |
| **CI/CD**           | GitHub Actions (build, test, format, audit) |
| **Deployment**      | Vercel (vercel.json present) + Docker       |
| **Automation**      | .automaker/ + .beads/ initialized           |

### Observations

- Default branch is `feat/marketing-site-sprint-implementation`, not `main`
- Has Dockerfile + docker-compose.yml (Docker support detected but not checked by pipeline)
- Payload CMS detected but database shows "none" (likely SQLite or env-configured)
- No Radix UI detected (shadcn uses Radix internally, so this may be a detection gap)
- Multiple scattered markdown docs (AGENTS.md, CONTENT_GUIDE.md, DEPLOYMENT.md, etc.) — candidate for consolidation

---

## Phase 2: Gap Analysis

**Date**: 2026-02-13
**Tool**: `analyze_gaps`
**Alignment Score**: 63%

### Compliant (11 items)

| #   | Category   | Item                  | Detail                            |
| --- | ---------- | --------------------- | --------------------------------- |
| 1   | automation | Automaker initialized | .automaker/ exists                |
| 2   | quality    | TypeScript strict     | TS 5.7.3 with strict: true        |
| 3   | testing    | Vitest configured     | v4.0.18                           |
| 4   | ci         | CI pipeline complete  | Build, test, format, audit checks |
| 5   | monorepo   | pnpm                  | Correct package manager           |
| 6   | quality    | Prettier              | Formatting configured             |
| 7   | frontend   | shadcn/ui             | Component library configured      |
| 8   | frontend   | Tailwind CSS          | v4.1.18                           |
| 9   | testing    | Playwright            | v1.56.1 for E2E                   |
| 10  | quality    | ESLint 9              | Flat config                       |
| 11  | automation | Beads                 | .beads/ initialized               |

### Gaps (7 items)

#### Critical (1)

| ID                  | Title                | Current                 | Target                       | Effort |
| ------------------- | -------------------- | ----------------------- | ---------------------------- | ------ |
| `branch-protection` | No branch protection | Main branch unprotected | Squash-only, required checks | small  |

#### Recommended (4)

| ID                 | Title                    | Current              | Target                                 | Effort |
| ------------------ | ------------------------ | -------------------- | -------------------------------------- | ------ |
| `storybook`        | Missing Storybook        | No component dev env | Storybook 10+ with nextjs-vite adapter | medium |
| `pre-commit-hooks` | Missing pre-commit hooks | No hooks             | Husky + lint-staged                    | small  |
| `discord`          | No Discord channels      | No integration       | Category with #general, #updates, #dev | small  |
| `coderabbit`       | Missing CodeRabbit       | No AI review         | CodeRabbit as required check           | small  |

#### Optional (2)

| ID            | Title              | Current | Target                        | Effort |
| ------------- | ------------------ | ------- | ----------------------------- | ------ |
| `mcp-servers` | No MCP servers     | None    | Domain-specific MCP server    | large  |
| `agent-sdk`   | No agent framework | None    | Claude Agent SDK or LangGraph | large  |

---

## Phase 2.5: Pre-existing Board State

The repo was partially set up before the gold standard was established (2026-02-10). Documenting what already exists.

### Existing Features on Board (5 total)

| Feature                                     | Status   | Cost  | Notes                                                      |
| ------------------------------------------- | -------- | ----- | ---------------------------------------------------------- |
| Audit codebase and generate CLAUDE.md       | verified | $0.99 | Agent-generated, 15KB, high quality                        |
| Set up GitHub Actions CI/CD                 | verified | $0.74 | 4 workflows created (build, test, format, audit)           |
| Configure branch protection for main        | verified | $0.36 | **FALSE POSITIVE** — gap analysis still detects as missing |
| Phase 1B epic (collections, blocks, routes) | backlog  | —     | Epic with 1 child feature                                  |
| Collections Implementation                  | verified | $1.92 | Child of Phase 1B epic                                     |

**Total prior agent spend**: $4.01

### Key Finding: Branch Protection — Pipeline Bug, Not Missing

The "Configure branch protection" feature was marked `verified` by a previous agent ($0.36), and gap analysis reports it as a critical gap. **Manual investigation reveals the agent DID apply it correctly.**

```
$ gh api repos/proto-labs-ai/protolabs.ai/rulesets --jq '.[0]'
{ "enforcement": "active", "name": "protect main", "target": "branch" }
```

**Root cause**: The research service checks the legacy `/branches/main/protection` API endpoint, but protolabs.ai uses **rulesets** (GitHub's modern branch protection). The legacy API returns "Not Found" for ruleset-protected repos → false negative.

**Pipeline fix needed**: `repo-research-service.ts:377` should also check `/repos/{owner}/{repo}/rulesets` as a fallback. Filed as pipeline improvement.

**Result**: `branch-protection` gap is a **false positive**. Actual gap count is 6, not 7. Adjusted score should be ~68%.

### Existing Context Files

- **CLAUDE.md** (15KB) — Comprehensive, stack-aware. Covers: project structure, all Payload collections/globals, commands, architecture, DB migrations, testing guidelines, env vars. Quality: **excellent** — no re-generation needed.

### Existing Config

- **protolab.config** — Minimal: `{ name, version, protolab: { enabled: true } }`. No tech stack, commands, or skip list populated.

---

## Phase 3: Initialization

**Date**: 2026-02-13
**Tool**: `setup_lab`
**Status**: Already initialized (.automaker/ and .beads/ exist from prior setup)

### Pre-existing Files

- `.automaker/` directory with features, context, memory
- `.beads/` task tracker
- `protolab.config` at project root (minimal — needs enrichment)

### Action Taken

- Skipped re-initialization (idempotent — won't overwrite existing files)
- Reviewed existing CLAUDE.md — quality is excellent, no changes needed
- Identified protolab.config needs tech stack and commands populated

---

## Phase 4: Alignment Proposal

**Date**: 2026-02-13
**Tool**: `propose_alignment`

### Proposed Milestones

#### Milestone 1: Foundation

- No gaps — already compliant (pnpm, TypeScript strict)

#### Milestone 2: Quality Gates

| Feature                     | Priority | Effort | Gap ID              |
| --------------------------- | -------- | ------ | ------------------- |
| Configure branch protection | Urgent   | small  | `branch-protection` |
| Set up Husky + lint-staged  | High     | small  | `pre-commit-hooks`  |
| Set up CodeRabbit AI review | High     | small  | `coderabbit`        |

#### Milestone 3: Testing

- No gaps — Vitest + Playwright already configured

#### Milestone 4: UI & Components

| Feature          | Priority | Effort | Gap ID      |
| ---------------- | -------- | ------ | ----------- |
| Set up Storybook | High     | medium | `storybook` |

#### Milestone 5: Automation & Agents

| Feature                         | Priority | Effort | Gap ID        |
| ------------------------------- | -------- | ------ | ------------- |
| Create Discord project channels | High     | small  | `discord`     |
| Create MCP server               | Normal   | large  | `mcp-servers` |
| Add Claude Agent SDK            | Normal   | large  | `agent-sdk`   |

### Estimated Effort

| Size      | Count          |
| --------- | -------------- |
| Small     | 4              |
| Medium    | 1              |
| Large     | 2              |
| **Total** | **7 features** |

---

## Phase 5: Execution Log

Track each alignment feature as it's implemented.

| #   | Feature             | Status           | PR  | Agent | Cost  | Date       |
| --- | ------------------- | ---------------- | --- | ----- | ----- | ---------- |
| 1   | Branch protection   | **already done** | —   | haiku | $0.36 | 2026-02-10 |
| 2   | Husky + lint-staged | pending          | —   | —     | —     | —          |
| 3   | CodeRabbit          | pending          | —   | —     | —     | —          |
| 4   | Storybook           | pending          | —   | —     | —     | —          |
| 5   | Discord channels    | pending          | —   | —     | —     | —          |
| 6   | MCP server          | deferred         | —   | —     | —     | —          |
| 7   | Agent SDK           | deferred         | —   | —     | —     | —          |

---

## Phase 6: Verification

After all features are implemented, re-run the pipeline to verify alignment.

| Run            | Date       | Score | Gaps Remaining | Notes    |
| -------------- | ---------- | ----- | -------------- | -------- |
| Initial        | 2026-02-13 | 63%   | 7              | Baseline |
| Post-alignment | —          | —     | —              | —        |

---

## Notes & Decisions

- **Default branch**: Repo's default branch is `feat/marketing-site-sprint-implementation`, not `main`. Branch protection targets `main` (confirmed active). Need to merge feature branch or set main as default.
- **Docker**: Has Dockerfile + docker-compose.yml but pipeline doesn't check Docker config. Not a gap per gold standard.
- **Payload CMS**: Detected as present. Database shows "none" — the CLAUDE.md reveals it uses `@payloadcms/db-vercel-postgres` with Neon. Pipeline detection gap: doesn't check Payload database adapters.
- **Optional gaps (MCP, Agent SDK)**: These are large efforts. Deferred — protolabs.ai is a marketing site, not an agent platform.
- **Scattered docs**: 8+ top-level .md files (AGENTS.md, CONTENT_GUIDE.md, DEPLOYMENT.md, etc.). Consider consolidating into a `docs/` directory as a cleanup task.
- **Prior setup cost**: $4.01 spent on 4 agent runs during pre-standards setup. All 3 completed features verified successfully. Good ROI.

---

## Pipeline Improvements Found

Issues discovered in the setupLab pipeline during this audit. These should be fixed in the Automaker codebase.

| #   | Issue                           | Severity | File                           | Description                                                                                                                                                                 |
| --- | ------------------------------- | -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rulesets not detected           | critical | `repo-research-service.ts:377` | Only checks legacy `/branches/main/protection` API. Repos using GitHub rulesets (modern approach) show as unprotected. Should fallback to `/repos/{owner}/{repo}/rulesets`. |
| 2   | Database adapter not detected   | low      | `repo-research-service.ts`     | Payload CMS database shows "none" when using `@payloadcms/db-vercel-postgres`. Should check Payload deps for database adapters.                                             |
| 3   | protolab.config not enriched    | low      | `routes/setup/project.ts`      | Generated config is minimal (name, version, enabled). Should populate techStack and commands from research data.                                                            |
| 4   | Composite config false negative | info     | gap analysis                   | Single-package repos (not monorepos) don't need composite TypeScript config, but the check doesn't distinguish. Not flagged here because check only fires for monorepos.    |
