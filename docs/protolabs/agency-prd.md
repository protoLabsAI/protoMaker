# PRD: protoLabs Agency System — Full-Loop Automation

> **Implementation Status (2026-02-16):**
> Milestone 1 (Signal Intake) — partially implemented (signal accumulator, idea processing flow).
> Milestone 2 (Antagonistic Review) — **complete** (3-stage sequential review with LangGraph + Langfuse tracing).
> Milestone 3 (Approval Gate) — partially implemented (HITL gates exist, trust boundaries in progress).
> Milestone 4 (Linear Project API) — **complete** (project lifecycle, Linear sync, bidirectional webhooks).
> Milestone 5 (Reflection Loop) — partially implemented (ceremonies exist, retro → improvement tickets pending).
> Milestone 6 (E2E Integration) — in progress (pipeline view pending, core flow functional).

## Situation

protoLabs has a strong execution engine: auto-mode processes features through dependency-ordered agent implementation, PR pipelines merge code with CI checks and CodeRabbit review, and Linear sync keeps the strategic layer informed. Over 40 sessions and 400+ PRs, we've proven the execution loop works.

But the system has critical gaps at the **boundaries** — intake and reflection. Ideas arrive ad-hoc through Discord/Linear/GitHub with no automated triage. PRDs are created by one agent without cross-functional challenge. Ceremonies post to Discord but don't close the loop by creating improvement tickets. There's no mechanism for the system to recognize its own friction points and auto-generate the work to fix them.

The execution middle is mature. The intake beginning and reflection end are manual. This means the system can't run autonomously end-to-end — it still requires Josh as the bottleneck for triage, PRD review, and improvement identification.

## Problem

**The IDEA → PRODUCTION → LEARNING loop is broken at two points:**

1. **Intake**: Signals arrive from 4+ sources (Discord, Linear, GitHub, agent observations) but nothing auto-triages them into PRDs. Ava manually reads Discord. Josh manually creates Linear issues. No automated classification, no priority routing, no cross-functional review.

2. **Reflection**: Ceremonies generate Discord posts but don't create actionable improvement tickets. Agent memory captures per-file gotchas but not project-level organizational learning. There's no "was this project worth it?" analysis that feeds into the next planning cycle.

**Secondary gaps:**

3. **Linear is strategic SOT but we can't programmatically create projects or documents** — the team manually copy-pastes. An "automation agency" that requires manual data entry in its planning tool is a contradiction.

4. **No antagonistic review** — PRDs go from creation to execution without being challenged. This is how bad ideas become expensive mistakes. We need Ava (ops) and Jon (GTM) to cross-examine every plan before committing resources.

5. **No preApproved trust boundaries** — Every PRD needs Josh's approval, including trivial operational improvements. This bottleneck prevents true autonomy for low-risk work.

6. **No automated changelog** — Stakeholders can't see what shipped without reading PR titles. Need human-readable summaries per project/milestone.

## Approach

### Milestone 1: Signal Intake Pipeline (Critical)

Build a unified signal router that classifies incoming signals and routes them to the correct pipeline.

**Phase 1.1: Signal Classification Service**

- New service: `SignalClassificationService`
- Receives raw signals from Discord messages, Linear issue creation webhooks, GitHub issue webhooks, and internal agent events
- Classifies each signal into: `idea`, `bug`, `improvement`, `question`, `gtm`, `ops`
- Assigns urgency: `critical`, `high`, `normal`, `low`
- Uses lightweight heuristic classification first (keyword matching, source context), with Claude fallback for ambiguous signals
- Files to modify: `apps/server/src/services/`, new service
- Acceptance criteria: Signals from all 4 sources classified with >80% accuracy on test corpus

**Phase 1.2: Signal → PRD Auto-Trigger**

- When a signal is classified as `idea` with urgency >= `normal`:
  - Auto-create a SPARC PRD draft using signal content as seed
  - Route to antagonistic review pipeline (Milestone 2)
- When classified as `bug`:
  - Fast-track: create protoLabs feature directly, skip PRD
- When classified as `improvement` or `ops`:
  - Create Bead for operational tracking
  - If complexity > small, trigger PRD pipeline
- Files to modify: `apps/server/src/services/signal-classification-service.ts`, integration with existing event system
- Acceptance criteria: Discord message "we need a user dashboard" auto-generates PRD draft within 60 seconds

**Phase 1.3: Discord Signal Listener**

- Listen to configured Discord channels for signal patterns
- Detect when Josh or team members post ideas vs. casual conversation
- Parse @mentions, thread context, and channel semantics
- Files to modify: Integration service, Discord webhook handling
- Acceptance criteria: Message in #ava-josh with idea keywords triggers signal classification

### Milestone 2: Antagonistic Review Pipeline (Critical)

Build the cross-functional PRD review where Ava and Jon challenge each other.

**Phase 2.1: Review Protocol**

- Define the antagonistic review process:
  1. PRD enters review state
  2. Ava reviews for operational feasibility (capacity, risk, technical debt, timeline)
  3. Jon reviews for market value (customer impact, competitive positioning, content opportunity, ROI)
  4. Each produces a structured critique with: `approve`, `concern`, `block` verdicts per section
  5. If any `block`: the blocker must justify and the other must respond
  6. After resolution: consolidated PRD with both perspectives merged
- New types in `@automaker/types`: `ReviewVerdict`, `AntagonisticReviewResult`
- Files to modify: `libs/types/src/`, new review types
- Acceptance criteria: Type definitions compile, review protocol documented

**Phase 2.2: Review Execution Service**

- New service: `AntagonisticReviewService`
- Orchestrates the Ava + Jon review as sequential agent executions
- Ava review runs first (using `execute_dynamic_agent` with ava template + review-specific prompt)
- Jon review runs second with access to Ava's critique
- Resolution agent (Ava as CoS) merges verdicts into final consolidated PRD
- Emits `prd:review:started`, `prd:review:completed` events
- Files to modify: `apps/server/src/services/`, new service
- Acceptance criteria: Given a PRD, produces consolidated review with both perspectives in < 3 minutes

**Phase 2.3: Review UI + Linear Integration**

- Post review summary to Linear as a document attached to the project
- Post review summary to Discord
- If any `block` verdicts remain after resolution: flag for Josh's attention in Linear
- Files to modify: Integration service, Linear sync, ceremony service
- Acceptance criteria: Review results visible in Linear and Discord within 1 minute of completion

### Milestone 3: Approval Gate + Trust Boundaries (High)

**Phase 3.1: preApproved Trust Rules**

- Define trust boundary rules in project settings:
  ```
  trustBoundaries:
    autoApprove:
      maxComplexity: "small"
      categories: ["ops", "improvement", "bug"]
      maxEstimatedCost: 5.00
    requireReview:
      categories: ["idea", "architectural"]
      minComplexity: "large"
  ```
- When a PRD passes antagonistic review and matches autoApprove rules → skip Josh review
- When it matches requireReview rules → create Linear issue with review request
- Emit events: `prd:auto-approved`, `prd:review-requested`
- Files to modify: `libs/types/src/settings.ts`, settings service, PRD pipeline
- Acceptance criteria: Small ops improvement auto-approved, large architectural feature requires Josh

**Phase 3.2: Linear Approval Workflow**

- When PRD needs human review:
  1. Create Linear issue with PRD content, review summary, and recommended action
  2. Set issue status to "In Review"
  3. Josh changes status to "Approved" or "Changes Requested" in Linear
  4. Webhook fires → triggers next pipeline stage or returns to PRD revision
- Files to modify: Linear webhook handler, Linear sync service
- Acceptance criteria: Status change in Linear triggers automated response within 30 seconds

### Milestone 4: Linear Project & Document API (High)

**Phase 4.1: Linear GraphQL Project Operations**

- Extend `LinearMCPClient` with project operations:
  - `createProject(teamId, name, description, icon)`
  - `updateProject(projectId, fields)`
  - `createDocument(projectId, title, content)`
  - `updateDocument(documentId, content)`
- Use Linear GraphQL API (mutations: `projectCreate`, `documentCreate`)
- Files to modify: `apps/server/src/services/linear-mcp-client.ts`
- Acceptance criteria: Can programmatically create a Linear project with 3 documents

**Phase 4.2: MCP Tools for Linear Projects**

- New MCP tools: `linear_create_project`, `linear_create_document`, `linear_update_document`
- Wire through to the server API
- Files to modify: `packages/mcp-server/src/index.ts`, new route handlers
- Acceptance criteria: Ava can create a Linear project via MCP tool

**Phase 4.3: Auto-Sync Projects to Linear**

- When `create_project` is called on protoLabs board:
  - Auto-create corresponding Linear project
  - Attach PRD as Linear document
  - Create milestone sub-issues
- When project status changes in protoLabs:
  - Sync to Linear project status
- Files to modify: Integration service, project service
- Acceptance criteria: `create_project` MCP call creates both protoLabs project and Linear project

### Milestone 5: Reflection Loop (High)

**Phase 5.1: Retro → Improvement Tickets**

- Extend `CeremonyService` retro generation:
  - After generating retro content, analyze it for actionable improvements
  - Use lightweight Claude query: "Given this retro, list 1-3 specific improvement tickets"
  - Auto-create Beads items for each improvement
  - If improvement is code-related, also create protoLabs feature
- Emit `retro:improvements:created` event
- Files to modify: `apps/server/src/services/ceremony-service.ts`
- Acceptance criteria: Milestone retro generates 1-3 Beads improvement items

**Phase 5.2: Automated Changelog**

- New service: `ChangelogService`
- On project completion or milestone completion:
  - Gather all merged features with PR titles, descriptions, and impact
  - Generate human-readable changelog grouped by category
  - Post to Discord
  - Attach as Linear document
- Files to modify: New service, ceremony integration
- Acceptance criteria: Project completion generates changelog with all features listed

**Phase 5.3: Metrics-Driven Impact Analysis**

- Extend `get_project_metrics` to include:
  - Cost per feature (API spend)
  - Average cycle time (creation → merged)
  - Failure rate and escalation count
  - Agent model distribution (what % was Haiku/Sonnet/Opus)
  - Comparison to historical averages
- Generate "Project Impact Report" as part of project retro
- Files to modify: Metrics routes, ceremony service
- Acceptance criteria: Project retro includes cost, time, quality metrics with historical comparison

**Phase 5.4: Knowledge Synthesis**

- On project completion:
  - Collect all `.automaker/memory/*.md` entries created during the project
  - Synthesize into a project-level learning summary
  - Update organizational MEMORY.md with key patterns
  - Archive project-specific memory entries
- Files to modify: Ceremony service, memory management
- Acceptance criteria: Project completion produces a 1-page learning summary

### Milestone 6: End-to-End Integration (Medium)

**Phase 6.1: Wire It All Together**

- Signal intake → PRD → antagonistic review → approval gate → planning → execution → PR → reflection → repeat
- Full pipeline test: Post a message in Discord → watch it become a merged PR → see retro generate improvement ticket
- Files to modify: Integration testing, event wiring
- Acceptance criteria: E2E flow completes without manual intervention for a preApproved signal

**Phase 6.2: Dashboard & Observability**

- Add protoLabs pipeline view to protoLabs UI:
  - Current signals being triaged
  - PRDs in review
  - Projects in execution
  - Recent retros and improvement tickets
- Files to modify: `apps/ui/src/`, new dashboard route/components
- Acceptance criteria: Single view shows full pipeline state

## Results

When complete, the protoLabs agency system will:

1. **Accept ideas from any source** (Discord, Linear, GitHub, agent observations) and auto-triage them into the correct pipeline
2. **Challenge every plan** through antagonistic cross-functional review before committing resources
3. **Auto-approve low-risk work** while routing high-impact decisions to Josh
4. **Execute autonomously** through the proven auto-mode → agent → PR → merge pipeline
5. **Reflect and improve** by auto-generating improvement tickets from retros and feeding them back into the intake pipeline
6. **Keep Linear as the strategic source of truth** with programmatic project and document creation
7. **Generate changelogs and impact reports** so stakeholders see what shipped and whether it was worth doing

The system becomes a **self-improving loop**: every project it runs makes it better at running the next project.

## Constraints

- Must not break existing execution pipeline — this is additive infrastructure
- Signal classification must work without expensive Claude calls for common cases (heuristic-first)
- Antagonistic review must complete in < 5 minutes to avoid blocking the pipeline
- Linear API operations must handle rate limits gracefully (Linear has strict GraphQL rate limits)
- preApproved auto-gate must be conservative at launch — false approval of a bad idea is worse than a Josh bottleneck
- All new services must emit events to the existing event system for observability
- Must work on both dev hardware (2-3 concurrent agents) and staging (6-10)
- Discord listener must not create noise — only process signals from configured channels
- Changelog generation must not expose internal details (agent names, cost, failure counts) in client-facing output
- Every new MCP tool must be built into `build:packages` (lesson from MCP server build gap)
- No Express 5 wildcard routes (`/:param(*)`) — use POST with body (lesson from session 39)
