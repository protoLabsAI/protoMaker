# Automaker Development Status

> Last updated: 2026-02-05

## Current Focus

**Self-Learning Skills** - Enabling agents to create and reuse learned skills.

## Epic Status Overview

| Epic                                                      | Status      | Progress | Branch                            |
| --------------------------------------------------------- | ----------- | -------- | --------------------------------- |
| [Foundation](#foundation)                                 | Done        | 4/4      | `epic/foundation`                 |
| [Ralph Loops](#ralph-loops)                               | Done        | 3/3      | `epic/ralph-loops`                |
| [Claude Plugin Improvements](#claude-plugin-improvements) | Done        | 3/3      | `epic/claude-plugin-improvements` |
| [Self-Learning Skills](#self-learning-skills)             | In Progress | 1/4      | `epic/self-learning-skills`       |
| [Proactive Automation](#proactive-automation)             | Backlog     | 0/4      | `epic/proactive-automation`       |

---

## Foundation

**Status:** Complete
**Branch:** `epic/foundation`

Core infrastructure for failure classification, completion verification, and recovery.

| Feature                            | Status |
| ---------------------------------- | ------ |
| Add Failure Classification Types   | Done   |
| Create Completion Verifier Service | Done   |
| Create Recovery Service            | Done   |
| Integrate Recovery into Auto-Mode  | Done   |

---

## Ralph Loops

**Status:** Complete (3/3)
**Branch:** `epic/ralph-loops`

Persistent retry loops with external verification.

| Feature                   | Status | Notes                                        |
| ------------------------- | ------ | -------------------------------------------- |
| Add Ralph Mode Types      | Done   |                                              |
| Create Ralph Loop Service | Done   |                                              |
| Add Ralph Mode MCP Tools  | Done   | 6 tools: start/stop/pause/resume/status/list |

---

## Claude Plugin Improvements

**Status:** Complete (3/3)
**Branch:** `epic/claude-plugin-improvements`

Improving the Claude Code plugin experience.

| Feature                                   | Status | Notes                                    |
| ----------------------------------------- | ------ | ---------------------------------------- |
| Auto-generate branchName for new features | Done   | Already implemented in feature-loader.ts |
| Add Epic UI components to Kanban cards    | Done   | epic-badge.tsx & epic-progress.tsx       |
| Update wiki with Claude Code plugin docs  | Done   | 4 new sections added                     |

All features complete!

---

## Self-Learning Skills

**Status:** In Progress (1/4)
**Branch:** `epic/self-learning-skills`

Enable agents to create reusable skills for future use.

| Feature                                 | Status  | Notes         |
| --------------------------------------- | ------- | ------------- |
| Add Skill Types                         | Done    | PR #25 merged |
| Create Skills Loader                    | Backlog | 2 failures    |
| Update Agent Prompts for Skill Creation | Backlog | 2 failures    |
| Add Skills MCP Tools                    | Backlog |               |

---

## Proactive Automation

**Status:** Backlog
**Branch:** `epic/proactive-automation`

Health monitoring, auto-remediation, and scheduled tasks.

| Feature                       | Status  | Notes      |
| ----------------------------- | ------- | ---------- |
| Create Health Monitor Service | Backlog | 5 failures |
| Add Scheduled Task Types      | Backlog |            |
| Create Scheduler Service      | Backlog | 4 failures |
| Add New Event Hook Triggers   | Backlog | 4 failures |

---

## Recently Completed

- **Add Skill Types** - TypeScript types for self-learning skills (PR #25)
- **Prompt & Plugin Audit** - Improved agent prompts, MCP param consistency, Graphite docs
- **Ralph Loops Epic** - Complete (3/3) with 6 MCP tools
- **Wiki Documentation** - Added Claude Code, Auto-Mode, Dependencies, and Epics sections
- **Claude Plugin Improvements Epic** - Complete (3/3 features)
- **Prompt Improvements** - Added status.md awareness and Agile best practices to agent prompts
- **Graphite CLI Integration** - Stack-aware PR management for epic workflow
- **Git Workflow Improvements** - Auto-target epic branches for feature PRs
- **Foundation Epic** - Failure classification and recovery infrastructure

---

## Agent Notes

When picking up work:

1. Check this file for current priorities
2. Update status when starting/completing features
3. Note any blockers or failures
4. Keep feature status.md files updated
