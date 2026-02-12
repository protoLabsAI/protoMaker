# Always-On Ava: Final Automation Sprint

# SPARC PRD: Always-On Ava — Final Automation Sprint

## Situation

Automaker has built a comprehensive automation pipeline over the last sprint: auto-mode service, git workflow (commit/push/PR), maintenance tasks (auto-merge, board health, worktree cleanup), PR feedback service, EM agent, 6 operational hooks, and a headless monitor script. The pipeline is 95% complete.

However, Ava (Chief of Staff) cannot yet run continuously without human intervention. Key automation defaults are disabled, the headless loop isn't deployed, there's no idle work pattern, and several pipeline stages require manual triggering.

## Problem

Five critical gaps prevent truly autonomous operation:

1. **Auto-merge is off by default** — `DEFAULT_GIT_WORKFLOW_SETTINGS.autoMergePR = false`. Every agent-created PR requires manual auto-merge enablement. The maintenance task checks `webhookSettings.autoMerge.enabled` per-project, which is also not configured. This means PRs pile up in "review" indefinitely.

2. **Auto-mode doesn't persist across server restarts** — The `autoModeAlwaysOn` setting exists in GlobalSettings but isn't enabled for any project. After server restarts (crashes, updates, deploys), auto-mode must be manually restarted.

3. **No continuous operation loop** — `ava-monitor.sh` exists but isn't deployed via launchd/cron. The stop hook gives one continuation per turn, but between Claude sessions, nothing runs. There's a gap between "session ends" and "next session starts."

4. **Empty board = full stop** — When all features are done, Ava stops completely. No proactive work happens: no code quality audits, no dependency updates, no research on agentic systems, no Discord monitoring, no system health checks beyond maintenance tasks.

5. **PR feedback doesn't trigger auto-remediation** — PRFeedbackService detects `changes_requested` and emits events, but no agent picks up the work to fix the code and push updates. The feature exists in backlog but hasn't been implemented.

## Approach

### Milestone 1: Enable Auto-Merge Pipeline (Priority: Urgent)

**Phase 1: Change auto-merge defaults**
- Change `DEFAULT_GIT_WORKFLOW_SETTINGS.autoMergePR` from `false` to `true` in `libs/types/src/settings.ts`
- Add `autoMergePR: true` to `DEFAULT_PROJECT_SETTINGS.gitWorkflow`
- Ensure the maintenance task `autoMergeEligiblePRs` reads from the correct settings path

Files: `libs/types/src/settings.ts`
Acceptance: New features default to auto-merge enabled. Maintenance task picks them up.

**Phase 2: Enable auto-merge for automaker project**
- Update project settings at `.automaker/settings.json` to enable `webhookSettings.autoMerge.enabled = true`
- Verify the 5-minute auto-merge maintenance task fires and merges eligible PRs
- Add MCP tool or UI toggle for per-project auto-merge control

Files: `.automaker/settings.json`, `apps/server/src/services/maintenance-tasks.ts`
Acceptance: PRs for automaker project auto-merge when CI passes and threads are resolved.

### Milestone 2: Always-On Auto-Mode (Priority: High)

**Phase 3: Enable autoModeAlwaysOn for automaker**
- Configure `globalSettings.autoModeAlwaysOn` with `enabled: true` and add automaker project path
- Server auto-starts auto-mode on boot for configured projects
- Auto-mode recovers after server crashes (orphan recovery already exists)

Files: `data/settings.json` (runtime config), `apps/server/src/index.ts` (startup code already exists)
Acceptance: After server restart, auto-mode automatically starts and picks up backlog features.

**Phase 4: Wire WorldStateMonitor to scheduler**
- Register WorldStateMonitor as a maintenance task (every 30s or 1min)
- Connect ReconciliationService to detect and fix drift: PR merged but feature stuck in review, agent crashed but feature still in_progress, etc.
- This closes the gap where features get stuck between states

Files: `apps/server/src/services/maintenance-tasks.ts`, `apps/server/src/services/world-state-monitor.ts`
Acceptance: Drift detected and auto-corrected within 1 minute. No more stuck features.

### Milestone 3: Continuous Operation (Priority: High)

**Phase 5: Deploy headless monitor via launchd**
- Create `~/Library/LaunchAgents/com.protolabs.ava-monitor.plist` for macOS launchd
- Configure to run `ava-monitor.sh --loop 300` on login, restart on failure
- Add health check: if monitor hasn't run in 10 minutes, alert via Discord
- Document setup in `docs/ava-headless-quickstart.md` (already partially done)

Files: `scripts/ava-monitor.sh`, new launchd plist, `docs/ava-headless-quickstart.md`
Acceptance: Ava monitoring loop starts on macOS login, survives terminal close, restarts on failure.

**Phase 6: Idle mode — proactive work when board is empty**
- Extend `/continue-ava` skill with an "idle work" section
- When board is empty, cycle through productive activities:
  1. System health check (disk space, npm audit, outdated packages)
  2. Code quality scan (TODOs, console.logs, dead code)
  3. PR pipeline check (any open PRs from other contributors?)
  4. Discord check (new messages from Josh?)
  5. Research task (fetch latest Claude SDK docs, check for new agent patterns)
- Use exponential backoff between idle passes (5min → 10min → 30min max)
- Post digest to Discord when interesting findings

Files: `packages/mcp-server/plugins/automaker/commands/continue-ava.md`
Acceptance: When board is empty, Ava does useful proactive work instead of stopping.

### Milestone 4: PR Feedback Auto-Remediation (Priority: Medium)

**Phase 7: Auto-fix PR feedback**
- When PRFeedbackService emits `pr:changes-requested`, auto-restart the dev agent in the feature's worktree
- Inject review feedback into the agent's continuation prompt so it knows exactly what to fix
- Agent pushes fix commits to the same PR branch
- Max 2 remediation rounds per PR to prevent infinite loops
- After 2 failures, escalate to human via Discord notification

Files: `apps/server/src/services/pr-feedback-service.ts`, `apps/server/src/services/auto-mode-service.ts`
Acceptance: CodeRabbit feedback automatically triggers agent fix cycle. PRs self-heal up to 2 rounds.

## Results

After this sprint, the automation pipeline will be fully closed-loop:

1. **Feature → Code → PR → Merge → Done** — Zero human intervention required
2. **Server crashes** — Auto-mode restarts automatically
3. **Between sessions** — Headless monitor keeps Ava checking every 5 minutes
4. **Empty board** — Proactive maintenance and research instead of idle
5. **PR feedback** — Auto-remediation fixes code review issues
6. **Drift** — WorldStateMonitor detects and corrects stuck states

Josh's role shifts to: creating features, setting strategic direction, reviewing Discord updates.

## Constraints

- Never restart the dev server programmatically
- Max 2-3 concurrent agents on local dev (configurable via AUTOMAKER_MAX_CONCURRENCY)
- Headless monitor requires Claude Code CLI + plugin installed
- Auto-merge must respect branch protection (CI must pass)
- PR remediation max 2 rounds to prevent API cost runaway
- Keep launchd plist simple — no complex dependencies
- All changes must go through PRs (no direct commits to main)

**Status:** active
**Created:** 2026-02-11T00:38:19.951Z
**Updated:** 2026-02-11T00:38:39.773Z

## Milestones

### 1. Enable Auto-Merge Pipeline

Change autoMergePR default to true, enable for automaker project, wire maintenance task to correct settings path

**Status:** pending

### 2. Always-On Auto-Mode

Enable autoModeAlwaysOn for automaker project, wire WorldStateMonitor to scheduler for drift detection and auto-correction

**Status:** pending

### 3. Continuous Operation

Deploy headless monitor via launchd, add idle mode with proactive work patterns when board is empty

**Status:** pending

### 4. PR Feedback Auto-Remediation

Wire PRFeedbackService changes-requested events to auto-restart dev agent with review feedback context, max 2 remediation rounds

**Status:** pending
