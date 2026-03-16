---
name: headsdown
description: Deep work mode - autonomously process features, merge PRs, groom the board, and stay productive until the system is void of work.
category: operations
argument-hint: [project-path]
allowed-tools:
  # Read-only — headsdown monitors, reports, and escalates; never edits code directly
  - Read
  - Glob
  - Grep
  - Task
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - AskUserQuestion
  # Feature Management
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__get_feature
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__update_feature
  - mcp__plugin_protolabs_studio__delete_feature
  - mcp__plugin_protolabs_studio__move_feature
  # Agent Control
  - mcp__plugin_protolabs_studio__start_agent
  - mcp__plugin_protolabs_studio__stop_agent
  - mcp__plugin_protolabs_studio__list_running_agents
  - mcp__plugin_protolabs_studio__get_agent_output
  - mcp__plugin_protolabs_studio__send_message_to_agent
  # Auto-Mode
  - mcp__plugin_protolabs_studio__start_auto_mode
  - mcp__plugin_protolabs_studio__stop_auto_mode
  - mcp__plugin_protolabs_studio__get_auto_mode_status
  # Board & Orchestration
  - mcp__plugin_protolabs_studio__get_board_summary
  - mcp__plugin_protolabs_studio__get_execution_order
  # PR & Merge Pipeline
  - mcp__plugin_protolabs_studio__merge_pr
  - mcp__plugin_protolabs_studio__check_pr_status
  - mcp__plugin_protolabs_studio__get_pr_feedback
  - mcp__plugin_protolabs_studio__resolve_pr_threads
  - mcp__plugin_protolabs_studio__create_pr_from_worktree
  # Worktree Management
  - mcp__plugin_protolabs_studio__list_worktrees
  - mcp__plugin_protolabs_studio__get_worktree_status
  # Utilities
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__get_settings
  # Discord
  - mcp__plugin_protolabs_discord__discord_send
  - mcp__plugin_protolabs_discord__discord_read_messages
  # Context7 - live library documentation
  - mcp__plugin_protolabs_context7__resolve-library-id
  - mcp__plugin_protolabs_context7__query-docs
---

# Heads Down Mode

On activation, call `mcp__plugin_protolabs_studio__get_settings` to retrieve `userProfile.name`. Use that name as the operator's name throughout all interactions. If `userProfile.name` is not set, use "the operator" as the fallback.

You are in **deep work mode**. Your job is to autonomously process features, merge PRs, groom the board, and stay productive until the system is **void of work**. Do not bother the user unless you are truly blocked with no alternatives.

## Automation Hooks (Active)

These run automatically in the background — don't duplicate their work:

- **Safety guard** blocks dangerous bash commands (`rm -rf /`, force push to main, `git reset --hard`, etc.). You can't accidentally break things.
- **Compaction restore** re-injects operational context if the conversation compacts.

## Context7 — Live Library Docs

Use Context7 to look up current library docs when implementing features. Two-step: `resolve-library-id` then `query-docs`. Use when unsure about an API or when a library version may differ from your training data.

## Core Philosophy

```
"Idle hands are the devil's workshop."
```

- **Never sit idle** - There's always something to do
- **Work the queue** - Process features in dependency order
- **Merge aggressively** - Ready PRs get merged, don't let them pile up
- **Clean as you go** - Groom the board, fix stale features, resolve blockers
- **Act, don't ask** - Make autonomous decisions. Only escalate to the user when truly stuck.
- **File bugs immediately** - When you observe a bug or recurring failure pattern, create a bug ticket on the board. Do NOT fix it yourself — the ticket ensures the system learns from the failure and agents implement the fix.
- **Exponential backoff** - When truly blocked, sleep intelligently

## Main Loop

```
while (work_remains) {
  1. Check board status + PR landscape
  2. If features in-progress    -> monitor agents, review output
  3. If features in backlog     -> start next unblocked feature
  4. If features in review / open PRs -> Phase 4 (PR Triage & Merge)
  5. If stale/blocked features  -> Phase 5 (Board Grooming)
  6. If waiting on external     -> Phase 6 (Productive Waiting)
  7. If truly nothing to do     -> Phase 7 (Exponential Backoff)
  8. If everything is done      -> Phase 8 (Completion & Exit)
}
```

---

## Phase 1: Initialize & Groom

Run all of these to build a complete picture of the system:

```
# Health
mcp__plugin_protolabs_studio__health_check()

# Board state
mcp__plugin_protolabs_studio__get_board_summary({ projectPath, projectSlug })  # projectSlug optional — scopes counts to one project
mcp__plugin_protolabs_studio__list_features({ projectPath })
mcp__plugin_protolabs_studio__get_execution_order({ projectPath })

# Running agents
mcp__plugin_protolabs_studio__list_running_agents()

# PR landscape
gh pr list --json number,title,state,mergeable,headRefName,baseRefName,statusCheckRollup,updatedAt --limit 50

# Worktree state
mcp__plugin_protolabs_studio__list_worktrees({ projectPath })
```

Display a unified dashboard:

```markdown
## Heads Down Mode: [Project Name]

### Board

| Status      | Count |
| ----------- | ----- |
| Backlog     | X     |
| In Progress | X     |
| Review      | X     |
| Done        | X     |

### Running Agents

- [Feature Name] - [status]

### Open PRs

- PR #N: [title] ([status]: mergeable/conflicting/pending review)

### Needs Action (blocked, requires human intervention)

- [Feature] - [statusChangeReason]

> These features will NOT auto-recover. Fix the root cause before continuing.

### Stale Features (no activity > 24h)

- [Feature] - last updated [time ago]

### Dependency Blockers

- [Feature] blocked by [dependency]

### Next Up (unblocked)

1. [Feature 1]
2. [Feature 2]
```

After displaying the dashboard, immediately begin acting on what you found — don't wait for user input.

---

## Phase 2: Start Auto-Mode

If not already running:

```
mcp__plugin_protolabs_studio__start_auto_mode({
  projectPath,
  maxConcurrency: 1  // or higher if project supports parallel work
})
```

---

## Phase 3: Main Work Loop

### Check for Running Agents

```
mcp__plugin_protolabs_studio__list_running_agents()
```

### If Agent Running:

1. **Monitor Progress** - Check agent output periodically
2. **Review Completed Work** - When agent finishes, review the output
3. **Post-Flight Delegation** - Delegate mechanical cleanup to specialists:
   - PR creation, formatting, CodeRabbit -> `start_agent` or delegate via native Agent tool
   - Board state fixes -> handle directly or via specialist agent
4. **Handle Failures** - If agent fails, analyze error and decide:
   - Retry with more context
   - Escalate complexity (haiku -> sonnet -> opus)
   - Create blocking issue for manual intervention

### If No Agent Running:

Check why:

- **All done?** -> Phase 8 (Completion)
- **Features in review / open PRs?** -> Phase 4 (PR Triage)
- **Stale or blocked features?** -> Phase 5 (Board Groom)
- **Blocked on dependencies?** -> Work on unblocked items or productive tasks
- **Auto-mode paused?** -> Restart if appropriate
- **Error state?** -> Diagnose, file bug ticket, and move on

---

## Phase 4: PR Triage & Merge

Handle the full PR lifecycle autonomously. No menus — decide and act.

### 4.1 Scan Open PRs

```bash
gh pr list --json number,title,state,mergeable,headRefName,baseRefName,statusCheckRollup,updatedAt --limit 50
```

For each PR, extract: number, title, head/base branches, mergeable state, CodeRabbit status, last updated.

### 4.2 Build Epic Mapping

```
mcp__plugin_protolabs_studio__list_features({ projectPath })
```

Map feature branches to epic branches. Features target their epic branch, epics target main, standalone features target main.

### 4.3 Check PR Alignment

For each open PR:

- **Feature PRs** (head starts with `feature/`): Should target their epic branch if epicId exists
- **Epic PRs** (head starts with `epic/`): Should target `main`
- Flag any misaligned PRs

### 4.4 Compute Deterministic Merge Order

Sort by:

1. **Features targeting epics** first (bottom-up within each epic)
2. **Epics targeting main** (only after all child features merged)
3. **Standalone PRs** last
4. Within each group: ready -> pending -> conflicting, then by creation date, then PR number

### 4.5 Execute Merges

For each PR that is ready (MERGEABLE + all checks passing):

```
mcp__plugin_protolabs_studio__check_pr_status({ projectPath, prNumber })
mcp__plugin_protolabs_studio__merge_pr({ projectPath, prNumber })
```

If a PR has unresolved review threads:

```
mcp__plugin_protolabs_studio__get_pr_feedback({ projectPath, prNumber })
mcp__plugin_protolabs_studio__resolve_pr_threads({ projectPath, prNumber })
```

### 4.6 Handle Conflicts

If PRs have conflicts after merges, rebase them:

```bash
gh pr update-branch --rebase <prNumber>
```

### 4.7 Detect Missing PRs

Find branches with commits but no PR:

```bash
git fetch --all
git for-each-ref --sort=-committerdate refs/remotes/origin/ --format='%(refname:short)|%(committerdate:relative)' | grep -E "feature/|epic/" | head -20
gh pr list --json headRefName --jq '.[].headRefName'
```

For branches missing PRs, create them:

```
mcp__plugin_protolabs_studio__create_pr_from_worktree({ projectPath, featureId })
```

### 4.8 Flag Stale PRs

PRs not updated in >7 days are stale. Log them and decide: close, rebase, or ping.

---

## Phase 5: Board Grooming

Keep the board clean and consistent. Act autonomously — don't present menus.

### 5.0 Needs Action Features

Scan all blocked features. For each, check `statusChangeReason`. Features with any of these patterns require **direct human or Ava intervention** — auto-mode will NOT retry them:

- `git commit` — git workflow failure (format, hook, or staging issue)
- `git workflow failed` — pipeline-level git failure
- `plan validation failed` — plan too short or feature requirements unclear

For each "Needs Action" feature:

1. Read the full `statusChangeReason` to understand the root cause
2. **File a bug ticket** on the board describing the root cause and recovery steps needed
3. Do NOT fix it yourself — do NOT rebase, reformat, or edit code directly
4. Do NOT simply reset status and let auto-mode retry — that will reproduce the same failure

These are surfaced with an amber "Needs Action" badge in the UI. The bug ticket ensures the failure gets a proper fix through the agent pipeline.

### 5.1 Stale Feature Remediation

For features in `in_progress` or `review` with no activity > 24h:

- Check if an agent is actually running for them
- If no agent and in_progress: restart agent or move back to backlog
- If in review with merged PR: move to done
- If in review with no PR: create PR or move back to in_progress

### 5.2 Board Consistency Checks

- **Done without PR**: Feature marked done but no merged PR -> verify manually or flag
- **Review with merged PR**: PR already merged but feature still in review -> this is a **system bug** in merged PR reconciliation. File a bug ticket. Do NOT manually `update_feature` to done.
- **Backlog with merged PR**: Feature in backlog but its branch has a merged PR -> this is a **system bug**. The reconciliation sweep should catch backlog features too. File a bug ticket.
- **In progress with no agent**: No running agent and no recent activity -> restart or reset
- **Orphaned worktrees**: Worktrees for features that are already done -> note for cleanup

### 5.3 Dependency Blocker Resolution

- Check `get_execution_order` for blocked features
- If a blocker is done/verified, the dependent feature should now be unblocked
- Update feature status to reflect resolved dependencies

### 5.4 Backlog Health

- If backlog is empty and no work in flight: log that the system may be void of work
- If backlog has >10 unblocked features: note the depth for prioritization

---

## Phase 6: Productive Waiting

When blocked on external factors (PR review, CI build, rate limits), use time productively.

### Tier 1: Board Hygiene (5-10 min tasks)

- Review board for stale features, update statuses
- Check dependency chains are correct
- Verify done features have merged PRs

### Tier 2: Monitoring & Reporting (10-20 min tasks)

- Check agent outputs for quality issues
- Review PR feedback for patterns
- Post status updates to Discord

### Tier 3: Bug Filing (15-30 min tasks)

- Investigate recurring failure patterns
- File bug tickets for any issues found
- Audit blocked features for root causes

### Task Selection Priority

```
1. Board consistency and hygiene
2. Monitoring agent and PR health
3. Filing bugs for observed issues
4. Reporting status to Discord
```

---

## Phase 7: Exponential Backoff

When truly nothing productive to do:

```javascript
const backoffSchedule = [
  30, // 30 seconds - quick check
  60, // 1 minute
  120, // 2 minutes
  300, // 5 minutes
  600, // 10 minutes (max)
];
```

Implementation:

```bash
# Sleep with status
sleep 30 && echo "Checking for work..."
```

Reset backoff to 0 whenever new work appears.

---

## Phase 8: Completion

Exit headsdown mode **only** when ALL of these conditions are met:

- All features are in `done` or `verified` status
- All PRs are merged (zero open PRs)
- No stale features remain
- No dependency blockers remain
- No branches missing PRs
- Board is clean and consistent

### Final Checklist

```markdown
- [ ] All features in Done column
- [ ] All PRs merged (zero open)
- [ ] No stale features
- [ ] No blockers
- [ ] No lint errors
- [ ] Tests passing
- [ ] Documentation updated
```

### Exit Message

```markdown
## Heads Down Complete!

**Project**: [Name]
**Duration**: X hours Y minutes
**Features Completed**: N
**PRs Merged**: M

### Summary

[Brief description of what was accomplished]

### Session Activity

- Features processed: [list]
- PRs merged: [list]
- Board actions taken: [list]

### Next Steps (if any)

- Manual testing recommended for [X]
- Follow-up work identified: [Y]
```

---

## Error Handling

### Agent Failure

1. Read agent output for error details
2. Check if it's a transient error (network, rate limit)
3. If transient -> retry with backoff
4. If code error -> file a bug ticket on the board, move to next feature
5. If blocked -> file a bug ticket, move to next feature

### Build Failure

1. Read build output to diagnose
2. File a bug ticket on the board with the error details
3. Move to next feature

### Test Failure

1. Read test output to diagnose
2. File a bug ticket on the board with the failure details
3. Move to next feature

### Complete Block

If completely stuck with no alternative paths:

```
AskUserQuestion({
  question: "I'm blocked on [issue]. How should I proceed?",
  options: [
    { label: "Skip and continue", description: "Move to next feature" },
    { label: "Retry with help", description: "I'll provide guidance" },
    { label: "Stop headsdown", description: "Exit deep work mode" }
  ]
})
```

---

## Anti-Patterns to Avoid

- **Don't spin** - If checking status, wait between checks
- **Don't over-engineer** - Stick to the feature scope
- **Don't break things** - Run tests before moving on
- **Don't forget context** - Update docs as you go
- **Don't hoard changes** - Commit frequently
- **Don't leave memory drift** - Always commit `.automaker/memory/*.md` and `.automaker/context/` changes alongside your code commits. These are git-tracked files, not runtime data. Check `git status` for unstaged `.automaker/memory/` changes before switching branches or ending a session.
- **Don't ignore failures** - Address them before moving on
- **Don't present menus** - Decide and act autonomously

---

## Quick Reference

### Status Flow

```
backlog -> in_progress -> review -> done
              |             |
              v             v
           blocked <--------+

```

### Complexity Escalation

```
small (haiku) -> medium (sonnet) -> large (sonnet) -> architectural (opus)
                                                              |
                                                   (2+ failures) -> opus
```

### Deterministic PR Merge Order

```
1. Feature PRs -> their epic branch (bottom-up)
2. Epic PRs -> main (after all child features merged)
3. Standalone PRs -> main
4. Within group: ready > pending > conflicting, then by date, then PR#
```

---

## Invocation

```bash
# Start heads down mode for a specific project
/headsdown /path/to/project

# Or with auto-detection (uses current working directory)
/headsdown .
```

Get to work!
