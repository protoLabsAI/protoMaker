# QA Testing — Project Intelligence: Research, Ceremonies & Paper Trail

**Branch:** staging
**Date:** 2026-03-13
**PRs merged:** #2398–#2416 (20 PRs)

---

## Milestone 1: Foundation (Types & Platform Helpers)

No UI to test — these are type and path additions consumed by later milestones.

**Verify:**
- [ ] `npm run build:packages` compiles cleanly (types + platform)
- [ ] `npm run typecheck` passes with zero errors

---

## Milestone 2: Research Agent

### 2.1 Manual Research Trigger

1. Open Projects view, pick any existing project (or create one)
2. Navigate to the project detail page
3. Open the **Research** tab
4. When researchStatus is idle: verify "Run Research" button appears
5. Click "Run Research"
6. Verify spinner shows with "Research in progress..." message
7. Wait for research to complete (1-3 min)
8. Verify research summary renders as Markdown
9. Verify sources list appears below the summary (if any web sources found)

**Expected files created:**
- `.automaker/projects/{slug}/research.md`
- Research-report artifact in project artifacts

### 2.2 Research on Project Create

1. Click "New Project" in Projects view
2. Fill in title, goal, description
3. Toggle **"Start with research"** ON
4. Submit the form
5. Verify toast: "Research started — findings will appear in the Research tab"
6. Navigate to the new project's Research tab
7. Verify spinner/running state while research is in progress
8. Verify research completes and summary renders

### 2.3 Research → PRD Pipeline

1. After research completes for a project, trigger PRD generation (via PM Agent or `/plan-project`)
2. Verify the generated PRD includes a "Research Findings" section sourced from research.md
3. If no research.md exists, PRD generation should behave as before (no error, no empty section)

### 2.4 Research Tab Error State

1. Trigger research on a project with an invalid path or missing config
2. Verify "failed" state renders with error message and "Retry" button
3. Click Retry — verify research re-triggers

---

## Milestone 3: Ceremony Automation

### 3.1 Ceremony Artifacts

1. Trigger a standup ceremony for any project (via PM chat or MCP `trigger_ceremony`)
2. After ceremony completes, check project **Artifacts** — verify a `ceremony-report` artifact was saved
3. Check project **Timeline** — verify a standup entry appears with author "ava"
4. Repeat for milestone retro and project retro if data available

### 3.2 Daily Standup Toggle (Settings)

1. Open **Settings** page
2. Scroll to **Ceremonies** section (in Developer settings)
3. Verify "Daily Standup" toggle is present, default OFF
4. Toggle it ON, refresh page — verify it persists
5. Toggle it OFF, refresh — verify it persists
6. Check `data/settings.json` — verify `ceremonies.dailyStandup.enabled` field matches

### 3.3 DailyStandupService (requires standup enabled + 20h elapsed)

1. Enable daily standup in settings
2. Set `ceremonies.dailyStandup.lastRunAt` to >20h ago in `data/settings.json` (or remove it)
3. Wait up to 15 minutes for the cron to fire
4. Verify standup artifact saved to `data/standups/{YYYY-MM-DD}.json`
5. Verify Discord #dev channel receives standup summary (if Discord configured)
6. Verify `lastRunAt` updated in `data/settings.json`

### 3.4 Phase Execution Status Sync

1. Create a project with milestones and features (via `/plan-project`)
2. Move a feature linked to a phase from backlog → in_progress
3. Check `project.json` — verify the linked phase's `executionStatus` changed to "in-progress"
4. Move the feature to done
5. Verify phase `executionStatus` is now "completed"

---

## Milestone 4: New Project Flow (UI)

### 4.1 Enriched New Project Dialog

1. Click "New Project" button
2. Verify form has: Title, Goal, **Description** (textarea), Priority, Color
3. Verify description field is between goal and priority
4. Verify "Start with research" toggle is at the bottom, default OFF
5. Fill all fields, submit — verify project created successfully
6. Submit with research toggle ON — verify toast and research starts

### 4.2 Project Progress Wizard

1. Open a project in **researching** status — verify banner shows spinner + "Research running..."
2. Open a project in **drafting** status — verify "Write PRD" button linking to PRD tab
3. Open a project in **reviewing** status — verify "Review PRD" button
4. Open a project in **approved** status — verify "Launch Project" button
5. Click "Launch Project" — verify it calls the launch mutation
6. Open a project in **active** status — verify feature progress bar
7. Open a project in **completed** status — verify "View Retrospective" link
8. Open a project with no lifecycle status (ongoing) — verify NO banner renders

---

## Milestone 5: Paper Trail UI

### 5.1 Enhanced Timeline

1. Open a project that has had ceremonies run
2. Go to **Timeline** tab
3. Verify ceremony events show type labels (Standup, Milestone Retro, Project Retro)
4. Verify ceremony events with artifacts show a "Report" link
5. Click the Report link — verify it opens the artifact
6. Verify filter bar has **Decision** and **Escalation** categories
7. Verify icons and colors are distinct for each event type
8. Verify non-ceremony events render as before (no regression)

### 5.2 Artifacts Tab

1. Open a project with ceremony-report artifacts
2. Go to **Artifacts** tab
3. Verify artifacts are grouped by type (Standup / Milestone Retro / Project Retro)
4. Verify each artifact has a distinct icon matching its type
5. Click an artifact card — verify it expands to show Markdown content
6. Verify "Download as Markdown" button is present
7. Click Download — verify browser downloads a `.md` file with the artifact content
8. Verify type filter dropdown at top of the list
9. Select a filter — verify only matching artifacts show
10. Verify default sort is date descending (newest first)

---

## Regression Checks

- [ ] Existing project creation still works without research toggle
- [ ] Existing ceremony flows (standup, retro) still fire correctly
- [ ] Board features load and display normally
- [ ] Auto-mode picks up and processes features as before
- [ ] Settings page loads without errors
- [ ] Timeline tab works for projects without ceremony data
- [ ] Artifacts tab works for projects without ceremony artifacts
