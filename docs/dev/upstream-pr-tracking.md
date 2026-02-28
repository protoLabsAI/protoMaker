# Upstream PR Tracking

Log of which upstream [AutoMaker-Org/automaker](https://github.com/AutoMaker-Org/automaker) PRs have been evaluated and pulled into this fork.

## Status Key

- ✅ Pulled in
- ❌ Not applicable
- Ticket created — evaluated, work tracked separately

## Evaluated PRs

### Pulled in

| PR   | Title                         | Notes                 |
| ---- | ----------------------------- | --------------------- |
| #810 | V0.15.0rc                     | Brought in previously |
| #805 | Worktree view customization   | Included in v0.15.0rc |
| #807 | Agent output validation fix   | Included in v0.15.0rc |
| #808 | dev-server:url-detected event | Included in v0.15.0rc |
| #809 | Backlog plan generation fix   | Included in v0.15.0rc |

### Ticket created (pending implementation)

| PR   | Title                            | Notes          |
| ---- | -------------------------------- | -------------- |
| #812 | Agent output summary             | Ticket created |
| #818 | Mobile responsive memory/context | Ticket created |

### Not applicable

| PR   | Title                  | Reason              |
| ---- | ---------------------- | ------------------- |
| #813 | (reverted)             | Reverted by #817    |
| #817 | Revert PR              | Superseded by #818  |
| #814 | Provider enabled state | Not merged upstream |

## Process

When evaluating a new upstream PR:

1. Review the diff at `https://github.com/AutoMaker-Org/automaker/pull/{N}`
2. Determine applicability to this fork
3. If applicable: create a feature ticket and mark as "Ticket created" above
4. If pulled in directly: merge the changes and mark as "Pulled in" above
5. If not applicable: document the reason in the "Not applicable" table above

## Future Automation

Consider a scheduled check using:

```bash
gh pr list --repo AutoMaker-Org/automaker --state closed --json number,title,mergedAt
```

This could auto-detect newly merged upstream PRs and create evaluation tickets on the board.
