# Project Intelligence — Research, Ceremonies & Paper Trail

Complete paper trail from idea to production with automated research agents, board-wide daily standups, per-milestone retros, and a guided project creation flow that surfaces the right action at every stage

**Status:** completed
**Created:** 2026-03-13T05:44:50.589Z
**Updated:** 2026-03-16T18:46:44.298Z

## PRD

### Situation

protoLabs Studio has a project lifecycle from idea → PRD → features → launch with partial ceremony automation (standup, retro, project retro via LangGraph flows) and data storage for artifacts, documents, timeline, and research. The PM Agent does inline codebase research before PRD generation. Ceremony state machine, ProjectArtifactService, and CadenceConfig types all exist but are not wired end-to-end. New project creation collects only title + goal with no guidance on next steps.

### Problem

1. No dedicated research phase — PM Agent does ad-hoc research inline, findings are not saved as a paper trail artifact or surfaced in the UI. 2. No complete paper trail — research.md, artifacts, and ceremony entries exist as structures but are not consistently populated through the full lifecycle. 3. Standups are per-project and cadence-based, but the team runs at high agent velocity across many projects — a daily board-wide standup covering all work since yesterday is more aligned with how the team operates. 4. Ceremonies are reactive only — standups and retros fire on milestone:completed events but have no cadence scheduler; CadenceConfig exists in types but nothing drives it. 5. New project creation drops users on an empty page with no PRD, no guidance, and no clear next step. 6. Milestone progress is invisible — phase.executionStatus exists but is not synced from feature:status-changed events.

### Approach

Research Agent: new authority agent (Sonnet model) that researches codebase and web before PRD generation, writes research.md, updates project.researchSummary, saves research-report artifact, emits project:research:completed. Opt-in via toggle in new project dialog. PM Agent reads research.md before generating SPARC PRD when available. Daily Standup Service: board-wide daily standup (not per-project) — gathers all feature status changes across all projects since lastRunAt, runs standup-flow with board-wide context, saves artifact, posts to Discord. Enabled globally in app Settings (Settings → Ceremonies → Daily Standup on/off). CadenceConfig moves from Project type to GlobalSettings.ceremonies. Ceremony Artifact Wiring: CeremonyService → ProjectArtifactService so every ceremony output is persisted as a ceremony-report artifact with a matching TimelineEntry. Phase Status Sync: feature:status-changed events update project.milestones[].phases[].executionStatus in ProjectService. New Project Flow UI: enriched creation dialog with description + research toggle, status-aware progression wizard showing the single most important next action per project status. Research tab in project detail shows live research status, summary markdown, and sources.

### Results

Every project has a complete immutable paper trail: research findings → PRD decisions → milestone retros → feature changelogs → project retro. Daily standup auto-fires across the entire board and posts to Discord. Ceremonies persist as artifacts with timeline entries. New project creation is a guided flow (create → research → PRD → approve → launch). Milestone progress auto-tracks from feature status. Research findings are surfaced in the UI before PRD authoring.

### Constraints

No breaking changes to existing ceremony flows, project data model, or authority agent patterns,Research agent is strictly read-only — allowed tools: Glob, Grep, Read, WebFetch, WebSearch only,Research is opt-in: only triggered when user toggles 'Start with research' in new project dialog or clicks Run Research on the Research tab,Daily standup uses Sonnet model, is global (not per-project), enabled in app Settings,CadenceScheduler uses existing cron infrastructure in the server (15-min check interval),Phase status sync is eventual-consistent via event-driven updates, not synchronous,Retros remain per-milestone/project triggered by milestone:completed (existing behavior preserved)

## Milestones

### 1. Foundation

Extend types and platform helpers to support research status, research artifacts, and global ceremony settings. No behavioral changes — pure type and path additions that downstream milestones depend on.

**Status:** completed

#### Phases

1. **Add research and ceremony types** (small)
2. **Add platform helpers for research paths** (small)

### 2. Research Agent

New authority agent that researches the codebase and web before PRD generation. Saves findings as research.md, updates project.researchSummary, persists a research-report artifact. PM Agent reads existing research before generating SPARC PRD.

**Status:** completed

#### Phases

1. **ResearchAgent authority agent** (large)
2. **Research lifecycle route and auto-trigger** (medium)
3. **PM Agent reads research before PRD generation** (small)

### 3. Ceremony Automation

Wire ceremony outputs to artifact persistence, add global daily standup service that covers the entire board, and sync phase execution status from feature events.

**Status:** completed

#### Phases

1. **Wire CeremonyService to ProjectArtifactService** (medium)
2. **Move CadenceConfig to GlobalSettings and add settings UI** (medium)
3. **DailyStandupService — board-wide standup** (large)
4. **Phase execution status sync from feature events** (medium)

### 4. New Project Flow (UI)

Guided project creation with research toggle, status-aware progression wizard, and research trigger in the project detail page.

**Status:** completed

#### Phases

1. **Enrich NewProjectDialog** (small)
2. **ProjectProgressWizard component** (medium)
3. **Research trigger in project detail** (medium)

### 5. Paper Trail UI

Enhanced timeline with ceremony artifact links, artifacts tab polish, and surface research sources in the Research tab.

**Status:** completed

#### Phases

1. **Enhanced Timeline — ceremony entries with artifact links** (medium)
2. **Artifacts tab polish — ceremony reports, standups, retros** (medium)
