# ProtoLabs Philosophy

## The Agency Model

ProtoLabs is not a tool — it's an agency. Every client project gets the same treatment: assessed against a gold standard, gaps identified, alignment work proposed and executed by AI agents. The human sets direction; the system does the work.

### Core Principles

**1. Prescriptive, Not Adaptive**

We don't detect what a project does and accommodate it. We define what a project _should_ be and measure the gap. This is the difference between a consultant who asks "what do you want?" and one who says "here's what you need."

The standard is derived from real production codebases — Automaker, rabbit-hole.io, rogue-borg, rpg-mcp. Every rule exists because we've seen the alternative fail.

**2. Separation of Concerns by Altitude**

Three surfaces, three altitudes:

| Surface       | Altitude      | Owns                                |
| ------------- | ------------- | ----------------------------------- |
| **Linear**    | Strategic     | Vision, goals, initiatives, roadmap |
| **Automaker** | Tactical      | Features, agents, branches, PRs     |
| **Discord**   | Communication | Async updates, decisions, alerts    |

Never mix altitudes. Linear doesn't track individual feature implementation. Automaker doesn't own roadmap vision. Discord connects humans across both layers.

**3. Agents as Teammates**

AI agents aren't tools you invoke — they're team members you delegate to. They have roles (PM, Engineering Manager, Backend Engineer), trust levels, and operational boundaries. Ava (Chief of Staff) is the prototype for all future agent teammates.

The pattern: base agent + domain tools → specialized role. A GTM coordinator gets the same base agent as a backend engineer, but with different tools (Linear API vs git operations).

**4. Git as the Source of Truth**

Everything that matters is in git. Feature state, task tracking (Beads), project specs, context files. If it's not in the repo, it doesn't exist. This makes projects portable, auditable, and resilient to infrastructure failures.

**5. Non-Destructive First**

The setup pipeline demonstrates this: scan, analyze, report, propose — all before touching a single file. Humans approve before agents execute. This builds trust and prevents the "AI rewrote everything" failure mode.

## Architecture Decisions

### Why pnpm + Turborepo

- **pnpm**: Strict dependency resolution prevents phantom dependencies. The workspace protocol (`workspace:*`) enforces correct inter-package references. Disk efficiency via content-addressable storage.
- **Turborepo**: Cached, parallel builds. Define the task graph once (`turbo.json`), get incremental builds forever. No custom build scripts that break when someone adds a package.

### Why TypeScript Strict + Composite

- **Strict mode**: Catches bugs at compile time that would be runtime errors otherwise. `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` — these aren't optional.
- **Composite configs**: Enable incremental compilation and project references. Each package builds independently. Change one package, rebuild only it and its dependents.

### Why Vitest over Jest

- Native ESM support (Jest's ESM support is experimental and fragile)
- Native TypeScript support (no `ts-jest` or `babel` transform)
- 2-10x faster execution
- Compatible API — migration is usually mechanical

### Why GitHub Actions + CodeRabbit + Branch Protection

This is the quality gate trifecta:

- **GitHub Actions**: Build, test, format, audit on every PR
- **CodeRabbit**: AI review catches issues humans miss
- **Branch protection**: Squash-only merges, required checks, no direct pushes

Together they ensure nothing reaches main without passing all gates.

### Why Squash-Only Merges

Feature branches are messy. "WIP", "fix tests", "actually fix tests", "ok really fix tests now" — nobody needs this in main. Squash-only gives you one clean commit per feature with a descriptive message.

## The Setup Pipeline

```
/setuplab ~/dev/client-project
    |
    v
Phase 1: RESEARCH ──────> Scan repo structure, detect current state
Phase 2: GAP ANALYSIS ──> Compare against our standard, generate report
Phase 3: INITIALIZE ─────> Create .automaker/, .beads/, Discord channels
Phase 4: PROPOSE ────────> Create features on the board for alignment work
    |
    v
[User reviews gap report + proposed features]
    |
    v
Phase 5: EXECUTE ────────> Start agents to do the alignment work
```

Phases 1-4 are non-destructive. They produce information, not code changes. Phase 5 is where agents actually modify the target repo — and only after explicit approval.

## Focus Areas

ProtoLabs serves four primary project types:

1. **Component Libraries** — shadcn/ui + Storybook + Tailwind. Visual development with isolated component testing.
2. **Microservices** — Python (FastAPI/Flask) for ML/AI alongside Node monorepo. Multi-runtime, single workflow.
3. **Prototyping** — Next.js + Payload CMS for rapid full-stack development. Database to UI in one monorepo.
4. **Agentic Systems** — Claude Agent SDK, MCP servers, LangGraph. AI-native applications with tool use.

The gold standard covers all four. A project might not use every piece, but when it needs something, the infrastructure is already there.

## Revenue Model

Content and social media build the brand. Consulting teaches others to set up their own proto labs. The pipeline is the product — point `/setuplab` at any repo and watch it align.
