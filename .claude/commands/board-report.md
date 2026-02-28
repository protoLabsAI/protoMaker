# Board Report Command

Generate comprehensive, digestible reports on board status, progress, and next actions.

## Purpose

Provide quick, actionable insights into:

- Current board health and progress
- What just completed
- What's actively being worked on
- What's coming up next
- Blockers and issues requiring attention

## Workflow

### 1. Gather Data

```
mcp__protolabs__health_check()
mcp__protolabs__get_board_summary()
mcp__protolabs__list_running_agents()
mcp__protolabs__get_auto_mode_status()
```

### 2. Analyze Completed Work

Check features in verified/review status:

- Features completed in last 24 hours
- PRs created/merged recently
- Epics that completed

### 3. Check Active Work

- Running agents and their features
- Auto-mode status and concurrency
- Features stuck in-progress (no agent)

### 4. Review Backlog

- Total features in backlog
- Independent features (no dependencies)
- Blocked features
- High-priority or small wins

### 5. Generate Report

## Report Format

```markdown
# 📊 Board Report

_Generated: [timestamp]_
_Project: [project-path]_

---

## 🎯 Summary

| Metric         | Count | Status |
| -------------- | ----- | ------ |
| Total Features | X     |        |
| Done           | X     | ✅     |
| In Progress    | X     | 🔄     |
| Review         | X     | 👀     |
| Backlog        | X     | ⏳     |

**Completion Rate**: X% (Y of Z features)

---

## ✅ Recently Completed (Last 24h)

### Features

1. **[Feature Title]** - [Epic] (verified)
   - Branch: feature/xyz
   - Completed: 2h ago
   - PR: #123 (open/merged)

2. **[Feature Title]** - [Epic] (verified)
   - Branch: feature/abc
   - Completed: 5h ago
   - PR: #124 (merged)

### Epics Completed

- **[Epic Name]** - All 5/5 features done

---

## 🔄 Active Work

### Running Agents (X)

1. **[Feature]** (Sonnet) - epic/[epic-name]
   - Started: 15m ago
   - Complexity: medium

2. **[Feature]** (Haiku) - Independent
   - Started: 30m ago
   - Complexity: small

### Auto-Mode

- Status: ✅ Running / ⏸️ Stopped
- Concurrency: 2 max
- Queue: X features ready

---

## 📋 Backlog Analysis

**Total**: X features

### Ready to Start (No Dependencies)

1. **[Feature]** - [Epic] (complexity: small)
2. **[Feature]** - [Epic] (complexity: medium)
3. **[Feature]** - Independent (complexity: small)

### Blocked (X features)

- **[Feature]** - Waiting on: [dependency]
- **[Feature]** - Waiting on: [dependency]

### By Epic

- **[Epic Name]**: 5 features
- **[Epic Name]**: 3 features
- **Independent**: 8 features

---

## 🎯 Recommended Next Actions

### High Priority

1. **Review PRs** - 3 open PRs need attention
2. **Start agents** - 5 ready features in backlog
3. **Resolve blockers** - Check missing dependencies

### Quick Wins (< 30min each)

- [Feature 1] - Type definitions only
- [Feature 2] - Documentation update
- [Feature 3] - Small config change

### High Impact

- [Feature 1] - Unlocks 3 downstream features
- [Feature 2] - Completes epic milestone

---

## 🚦 Health Indicators

| Indicator  | Status       | Notes                                      |
| ---------- | ------------ | ------------------------------------------ |
| Auto-mode  | ✅ / ⚠️ / ❌ | Running smoothly / Needs restart / Stopped |
| PRs        | ✅ / ⚠️      | X open, Y need review                      |
| Blockers   | ✅ / ⚠️      | No blockers / X features blocked           |
| Backlog    | ✅ / ⚠️      | Healthy size / Growing / Empty             |
| Completion | ✅ / ⚠️      | On track / Slowing down                    |

**Overall Health**: ✅ Excellent / 🟡 Good / ⚠️ Needs Attention / 🔴 Critical

---

## 📈 Progress Trends

**Last 24h**: +X features completed
**Last 7d**: +Y features completed
**Average**: Z features/day

**Current Velocity**: [Increasing / Steady / Decreasing]

---

## 💡 Strategic Insights

- Epic "[Name]" is 80% complete - finish remaining 2 features
- Backlog is balanced - good mix of small/medium/large
- 5 independent features - perfect for parallel execution
- Consider grouping related features into new epic

---

Would you like to:

- [ ] Start auto-mode on ready features?
- [ ] Review and merge open PRs?
- [ ] Create new features to fill backlog?
- [ ] Generate detailed epic status report?
```

## Report Variants

### Quick Report (--quick)

Just summary stats and active work

### Epic Report (--epic [epic-id])

Deep dive into specific epic progress

### Trend Report (--trend)

Historical analysis over time

### Next Actions (--next)

Just the recommended actions section

## When to Use

Run this command:

- At start/end of work session
- Before sprint planning
- When checking project health
- After major milestone completion
- Before/after starting auto-mode

## Examples

```bash
# Full board report
/board-report

# Quick status check
/board-report --quick

# Epic-specific report
/board-report --epic feature-abc-123

# Show trends
/board-report --trend

# Next actions only
/board-report --next
```

## Best Practices

- Run regularly to stay informed
- Use before making decisions (start auto-mode, create features)
- Share with team for alignment
- Track trends over time for velocity insights
- Combine with /groom for maintenance

## Integration

Works well with:

- `/groom` - For cleanup and maintenance
- `/pr-review` - For PR management
- `/auto-mode` - For execution planning
- `/orchestrate` - For dependency insights
