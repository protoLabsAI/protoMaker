---
name: headsdown
description: Deep work mode - autonomously process features, manage the board, clean up code, update docs, and stay productive until everything is done.
argument-hint: [project-path]
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - AskUserQuestion
  - mcp__plugin_automaker_automaker__list_features
  - mcp__plugin_automaker_automaker__get_feature
  - mcp__plugin_automaker_automaker__create_feature
  - mcp__plugin_automaker_automaker__update_feature
  - mcp__plugin_automaker_automaker__move_feature
  - mcp__plugin_automaker_automaker__start_agent
  - mcp__plugin_automaker_automaker__stop_agent
  - mcp__plugin_automaker_automaker__list_running_agents
  - mcp__plugin_automaker_automaker__get_agent_output
  - mcp__plugin_automaker_automaker__send_message_to_agent
  - mcp__plugin_automaker_automaker__start_auto_mode
  - mcp__plugin_automaker_automaker__stop_auto_mode
  - mcp__plugin_automaker_automaker__get_auto_mode_status
  - mcp__plugin_automaker_automaker__get_board_summary
  - mcp__plugin_automaker_automaker__get_execution_order
  - mcp__plugin_automaker_automaker__health_check
  - mcp__discord__send_message
  - mcp__discord__list_channels
---

# Heads Down Mode

You are in **deep work mode**. Your job is to stay productive and get everything done without bothering the user unless absolutely necessary.

## Automation Hooks (Active)

These run automatically in the background — don't duplicate their work:

- **Stop hook** checks the board when you finish responding. If work remains, it blocks the stop and continues. You get one automatic continuation per turn.
- **Safety guard** blocks dangerous bash commands (`rm -rf /`, force push to main, `git reset --hard`, etc.). You can't accidentally break things.
- **Auto-format** runs prettier on every Edit/Write. Never run `npm run format` manually.
- **Compaction restore** re-injects operational context if the conversation compacts.

## Core Philosophy

```
"Idle hands are the devil's workshop."
```

- **Never sit idle** - There's always something to do
- **Work the queue** - Process features in dependency order
- **Clean as you go** - Hooks handle format; you handle tests and docs
- **Communicate progress** - Update Discord, log status
- **Exponential backoff** - When truly blocked, sleep intelligently

## Workflow Loop

```
while (work_remains) {
  1. Check board status
  2. If features in-progress → monitor agents, review output
  3. If features in backlog → start next unblocked feature
  4. If waiting on external (PR, build) → do productive work
  5. If truly nothing to do → exponential backoff sleep
  6. Repeat
}
```

---

## Phase 1: Initialize

```bash
# Check health
mcp__plugin_automaker_automaker__health_check()

# Get board state
mcp__plugin_automaker_automaker__get_board_summary({ projectPath })
mcp__plugin_automaker_automaker__list_features({ projectPath })
mcp__plugin_automaker_automaker__get_execution_order({ projectPath })
```

Display current state:

```markdown
## Heads Down Mode: [Project Name]

| Status      | Count |
| ----------- | ----- |
| Backlog     | X     |
| In Progress | X     |
| Review      | X     |
| Done        | X     |

### Currently Running Agents

- [Feature Name] - [status]

### Next Up (unblocked)

1. [Feature 1]
2. [Feature 2]
```

---

## Phase 2: Start Auto-Mode

If not already running:

```
mcp__plugin_automaker_automaker__start_auto_mode({
  projectPath,
  maxConcurrency: 1  // or higher if project supports parallel work
})
```

---

## Phase 3: Main Work Loop

### Check for Running Agents

```
mcp__plugin_automaker_automaker__list_running_agents()
```

### If Agent Running:

1. **Monitor Progress** - Check agent output periodically
2. **Review Completed Work** - When agent finishes, review the output
3. **Handle Failures** - If agent fails, analyze error and decide:
   - Retry with more context
   - Escalate complexity (haiku → sonnet → opus)
   - Create blocking issue for manual intervention

### If No Agent Running:

Check why:

- **All done?** → Celebrate, final cleanup, exit
- **Blocked on dependencies?** → Work on unblocked items or productive tasks
- **Auto-mode paused?** → Restart if appropriate
- **Error state?** → Diagnose and fix

---

## Phase 4: Productive Waiting

When blocked on external factors (PR review, CI build, rate limits), use time productively:

### Tier 1: Code Quality (5-10 min tasks)

```bash
# Run linter, fix issues
npm run lint -- --fix

# Format code
npm run format

# Type check
npm run build:packages
```

### Tier 2: Documentation (10-20 min tasks)

- Update README if features changed
- Add JSDoc comments to new functions
- Update CLAUDE.md if patterns evolved
- Review and update API docs

### Tier 3: Cleanup (15-30 min tasks)

- Remove dead code
- Consolidate duplicate utilities
- Clean up TODO comments (fix or create issues)
- Archive completed project docs

### Tier 4: Maintenance (30+ min tasks)

- Dependency updates (minor versions)
- Test coverage for new code
- Performance profiling
- Security audit of new endpoints

### Task Selection Priority

```
1. Directly related to current feature work
2. Blocking issues from previous features
3. General code quality
4. Documentation
5. Nice-to-have improvements
```

---

## Phase 5: Exponential Backoff

When truly nothing productive to do:

```javascript
const backoffSchedule = [
  30, // 30 seconds - quick check
  60, // 1 minute
  120, // 2 minutes
  300, // 5 minutes
  600, // 10 minutes (max)
];

let attempt = 0;

while (waiting) {
  const sleepTime = backoffSchedule[Math.min(attempt, backoffSchedule.length - 1)];

  console.log(`Sleeping ${sleepTime}s (attempt ${attempt + 1})...`);
  sleep(sleepTime);

  // Check for new work
  const status = checkBoardStatus();

  if (status.hasWork) {
    attempt = 0; // Reset backoff
    processWork();
  } else {
    attempt++;
  }
}
```

Implementation:

```bash
# Sleep with status
sleep 30 && echo "Checking for work..."
```

---

## Phase 6: Progress Reporting

### Discord Updates (if configured)

```
# On feature start
"🚀 Starting: [Feature Name]"

# On feature complete
"✅ Completed: [Feature Name] - [brief summary]"

# On milestone complete
"🎯 Milestone Complete: [Milestone Name]
   - X features done
   - Next: [Next Milestone]"

# On project complete
"🎉 Project Complete: [Project Name]
   - Total features: X
   - Duration: Y hours"
```

### Terminal Status

Every 5 features or 30 minutes, output status:

```markdown
## Heads Down Progress Report

**Time Elapsed**: 2h 15m
**Features Completed**: 8/23
**Current**: Channel Management

### Completed This Session

- ✅ Type Definitions (3m)
- ✅ Settings Migration (8m)
- ✅ Core Discord Service (12m)
  ...

### Up Next

- Channel Management (in progress)
- Notification System
- Event Hook Extension
```

---

## Phase 7: Completion

When all features are done:

### Final Checklist

```markdown
- [ ] All features in Done column
- [ ] No lint errors
- [ ] Tests passing
- [ ] Documentation updated
- [ ] CHANGELOG updated (if applicable)
- [ ] Discord notified
```

### Cleanup Tasks

1. Archive project plan (mark as completed)
2. Update project status
3. Create summary report
4. Notify user of completion

### Exit Message

```markdown
## Heads Down Complete! 🎉

**Project**: [Name]
**Duration**: X hours Y minutes
**Features Completed**: N

### Summary

[Brief description of what was accomplished]

### Files Changed

- libs/types/src/settings.ts
- apps/server/src/services/discord-service.ts
- ... (grouped by category)

### Next Steps (if any)

- Manual testing recommended for [X]
- PR review needed for [Y]
```

---

## Error Handling

### Agent Failure

1. Read agent output for error details
2. Check if it's a transient error (network, rate limit)
3. If transient → retry with backoff
4. If code error → analyze and potentially fix manually
5. If blocked → create issue, move to next feature

### Build Failure

1. Run build locally to reproduce
2. Check for missing dependencies
3. Fix type errors
4. Retry

### Test Failure

1. Run specific failing test
2. Analyze test output
3. Fix if straightforward
4. If complex, create follow-up feature

### Complete Block

If completely stuck:

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

❌ **Don't spin** - If checking status, wait between checks
❌ **Don't over-engineer** - Stick to the feature scope
❌ **Don't break things** - Run tests before moving on
❌ **Don't forget context** - Update docs as you go
❌ **Don't hoard changes** - Commit frequently
❌ **Don't ignore failures** - Address them before moving on

---

## Quick Reference

### Key Commands

```bash
# Board status
mcp__plugin_automaker_automaker__get_board_summary({ projectPath })

# Start auto-mode
mcp__plugin_automaker_automaker__start_auto_mode({ projectPath })

# Check agents
mcp__plugin_automaker_automaker__list_running_agents()

# Get agent output
mcp__plugin_automaker_automaker__get_agent_output({ projectPath, featureId })

# Move feature
mcp__plugin_automaker_automaker__move_feature({ projectPath, featureId, status })
```

### Status Flow

```
backlog → in-progress → review → done
           ↑                ↓
           └── (on failure) ┘
```

### Complexity Escalation

```
small (haiku) → medium (sonnet) → large (sonnet) → architectural (opus)
                                                           ↓
                                              (2+ failures) → opus
```

---

## Invocation

```bash
# Start heads down mode for current project
/headsdown /home/josh/dev/automaker

# Or with auto-detection
/headsdown .
```

Get to work! 🔨
