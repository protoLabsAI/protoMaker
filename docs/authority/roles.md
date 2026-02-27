# Team Roles

> Auto-generated from `built-in-templates.ts`. Run `npx tsx scripts/generate-org-docs.ts` to update.
>
> Last generated: 2026-02-21

## Organization Chart

```text
Project Owner (CEO, Human)
├── AVA, Opus, Trust=3 — Engineering
│   ├── Matt, Sonnet, Trust=2
│   ├── Sam, Sonnet, Trust=2
│   ├── Frank, Sonnet, Trust=2
│   ├── Cindi, Sonnet, Trust=2
│   ├── Backend Engineer, Sonnet, Trust=2
│   ├── Product Manager, Sonnet, Trust=1
│   ├── Engineering Manager, Sonnet, Trust=1
│   ├── Linear Specialist, Sonnet, Trust=2
│   ├── PR Maintainer, Haiku, Trust=2
│   └── Board Janitor, Haiku, Trust=1
└── Jon, Sonnet, Trust=1 — Go-to-Market
```

## Active Roster

| Agent                                       | Role                | Model  | Trust           | Reports To    | Capabilities                  | Exposure     |
| ------------------------------------------- | ------------------- | ------ | --------------- | ------------- | ----------------------------- | ------------ |
| **Project Owner**                           | CEO & Founder       | —      | 3 (Autonomous)  | —             | All                           | —            |
| [AVA](#ava)                                 | chief-of-staff      | Opus   | 3 (Autonomous)  | Owner         | Bash, Edit, Commit, PR, Spawn | CLI, Discord |
| [Matt](#matt)                               | frontend-engineer   | Sonnet | 2 (Conditional) | AVA           | Bash, Edit, Commit, PR        | CLI, Discord |
| [Sam](#sam)                                 | backend-engineer    | Sonnet | 2 (Conditional) | AVA           | Bash, Edit, Commit, PR        | CLI, Discord |
| [Frank](#frank)                             | devops-engineer     | Sonnet | 2 (Conditional) | AVA           | Bash, Edit, Commit, PR        | CLI, Discord |
| [Cindi](#cindi)                             | content-writer      | Sonnet | 2 (Conditional) | AVA           | Edit, Commit, PR              | CLI, Discord |
| [Backend Engineer](#backend-engineer)       | backend-engineer    | Sonnet | 2 (Conditional) | AVA           | Bash, Edit, Commit, PR        | Internal     |
| [Product Manager](#product-manager)         | product-manager     | Sonnet | 1 (Assisted)    | AVA           | Read-only                     | Internal     |
| [Engineering Manager](#engineering-manager) | engineering-manager | Sonnet | 1 (Assisted)    | AVA           | Read-only                     | Internal     |
| [Linear Specialist](#linear-specialist)     | linear-specialist   | Sonnet | 2 (Conditional) | AVA           | Read-only                     | Internal     |
| [PR Maintainer](#pr-maintainer)             | pr-maintainer       | Haiku  | 2 (Conditional) | AVA           | Bash, Edit, Commit, PR        | Internal     |
| [Board Janitor](#board-janitor)             | board-janitor       | Haiku  | 1 (Assisted)    | AVA           | Read-only                     | Internal     |
| [Jon](#jon)                                 | gtm-specialist      | Sonnet | 1 (Assisted)    | Project Owner | Bash, Edit                    | CLI, Discord |

## Project Owner {#josh}

**Type:** Human
**Role:** CEO & Founder
**Trust Level:** 3 (Autonomous)

### Description

Technical architecture decisions, product vision, hands-on coding. The goal is to offload everything that isn't creative vision and deep technical work to the AI team.

### Direct Reports

- [AVA](#ava) — Autonomous operator with full authority
- [Jon](#jon) — GTM Specialist — content strategy, brand positioning, social media, competitive research, and launch execution

---

## AVA — Autonomous Virtual Agency {#ava}

**Type:** AI
**Role:** chief-of-staff
**Model:** Opus
**Trust Level:** 3 (Autonomous)
**Reports to:** Project Owner
**Exposure:** CLI, Discord
**Capabilities:** Bash, Edit, Commit, PR, Spawn
**Tags:** operations, leadership, autonomous

### Description

Autonomous operator with full authority. Manages operations, coordinates agents, and drives execution.

### Direct Reports

- [Matt](#matt) — Frontend engineering specialist
- [Sam](#sam) — AI agent engineer
- [Frank](#frank) — Manages infrastructure, CI/CD, deployments, monitoring, and system reliability
- [Cindi](#cindi) — Content writing specialist for protoLabs
- [Backend Engineer](#backend-engineer) — Implements server-side features, APIs, services, and database logic
- [Product Manager](#product-manager) — Manages requirements, priorities, roadmap, and stakeholder communication
- [Engineering Manager](#engineering-manager) — Oversees engineering execution, code review, team coordination, and technical decisions
- [Linear Specialist](#linear-specialist) — Owns all Linear workspace operations: project management, sprint planning, issue lifecycle, initiative tracking, and Automaker board synchronization
- [PR Maintainer](#pr-maintainer) — Handles PR pipeline mechanics: auto-merge enablement, CodeRabbit thread resolution, format fixing in worktrees, branch rebasing, and PR creation from orphaned worktrees
- [Board Janitor](#board-janitor) — Maintains board consistency: moves merged-PR features to done, resets stale in-progress features, repairs dependency chains

### Delegation

Can spawn sub-agents with roles: backend-engineer, frontend-engineer, devops-engineer

---

## Matt {#matt}

**Type:** AI
**Role:** frontend-engineer
**Model:** Sonnet
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** CLI, Discord
**Capabilities:** Bash, Edit, Commit, PR
**Tags:** implementation, frontend, ui, design-system, storybook

### Description

Frontend engineering specialist. Implements UI components, design systems, theming, and Storybook. Reports to Ava.

---

## Sam {#sam}

**Type:** AI
**Role:** backend-engineer
**Model:** Sonnet
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** CLI, Discord
**Capabilities:** Bash, Edit, Commit, PR
**Tags:** implementation, ai-agents, langgraph, observability, flows

### Description

AI agent engineer. Designs multi-agent flows, LangGraph state graphs, LLM provider integrations, and observability pipelines. Reports to Ava.

---

## Frank {#frank}

**Type:** AI
**Role:** devops-engineer
**Model:** Sonnet
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** CLI, Discord
**Capabilities:** Bash, Edit, Commit, PR
**Tags:** infrastructure, devops, ci-cd

### Description

Manages infrastructure, CI/CD, deployments, monitoring, and system reliability.

---

## Cindi {#cindi}

**Type:** AI
**Role:** content-writer
**Model:** Sonnet
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** CLI, Discord
**Capabilities:** Edit, Commit, PR
**Tags:** content, writing, blog, documentation, seo, training-data

### Description

Content writing specialist for protoLabs. Uses content pipeline flows to produce blog posts, technical docs, training data, and marketing content. Expert in SEO, antagonistic review, and multi-format output.

---

## Backend Engineer {#backend-engineer}

**Type:** AI
**Role:** backend-engineer
**Model:** Sonnet
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** Internal
**Capabilities:** Bash, Edit, Commit, PR
**Tags:** implementation, backend, api

### Description

Implements server-side features, APIs, services, and database logic.

---

## Product Manager {#product-manager}

**Type:** AI
**Role:** product-manager
**Model:** Sonnet
**Trust Level:** 1 (Assisted)
**Reports to:** AVA
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** planning, product, requirements

### Description

Manages requirements, priorities, roadmap, and stakeholder communication.

---

## Engineering Manager {#engineering-manager}

**Type:** AI
**Role:** engineering-manager
**Model:** Sonnet
**Trust Level:** 1 (Assisted)
**Reports to:** AVA
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** management, review, coordination

### Description

Oversees engineering execution, code review, team coordination, and technical decisions.

---

## Linear Specialist {#linear-specialist}

**Type:** AI
**Role:** linear-specialist
**Model:** Sonnet
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** linear, project-management, sprint-planning, issues, initiatives

### Description

Owns all Linear workspace operations: project management, sprint planning, issue lifecycle, initiative tracking, and Automaker board synchronization.

---

## PR Maintainer {#pr-maintainer}

**Type:** AI
**Role:** pr-maintainer
**Model:** Haiku
**Trust Level:** 2 (Conditional)
**Reports to:** AVA
**Exposure:** Internal
**Capabilities:** Bash, Edit, Commit, PR
**Tags:** pr, pipeline, maintenance, formatting, coderabbit

### Description

Handles PR pipeline mechanics: auto-merge enablement, CodeRabbit thread resolution, format fixing in worktrees, branch rebasing, and PR creation from orphaned worktrees.

---

## Board Janitor {#board-janitor}

**Type:** AI
**Role:** board-janitor
**Model:** Haiku
**Trust Level:** 1 (Assisted)
**Reports to:** AVA
**Exposure:** Internal
**Capabilities:** Read-only
**Tags:** board, maintenance, cleanup, dependencies

### Description

Maintains board consistency: moves merged-PR features to done, resets stale in-progress features, repairs dependency chains.

---

## Jon {#jon}

**Type:** AI
**Role:** gtm-specialist
**Model:** Sonnet
**Trust Level:** 1 (Assisted)
**Reports to:** Project Owner
**Exposure:** CLI, Discord
**Capabilities:** Bash, Edit
**Tags:** marketing, content, growth, gtm, brand

### Description

GTM Specialist — content strategy, brand positioning, social media, competitive research, and launch execution.

---

## Unassigned Templates

These templates exist in the registry but are not placed in the org hierarchy:

- **Kai** (kai) — Backend engineer. Implements Express routes, services, API design, error handling, and server-side features. Reports to Ava.

## Adding a New Team Member

1. Create a prompt file in `libs/prompts/src/agents/<name>.ts`
2. Register the prompt in `libs/prompts/src/prompt-registry.ts`
3. Add the template to `apps/server/src/services/built-in-templates.ts`
4. Add the agent to the `ORG_HIERARCHY` in `scripts/generate-org-docs.ts`
5. Run `npx tsx scripts/generate-org-docs.ts` to regenerate this document
