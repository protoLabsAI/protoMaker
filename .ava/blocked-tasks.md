# Blocked Tasks

## gh auth not configured
- **Task:** ava-daily-board-health
- **Blocked since:** 2026-03-11
- **Reason:** `gh auth login` has not been run. No GitHub API access.
- **Fix:** Run `gh auth login` interactively, then re-run the scheduled task.
- **Impact:** Cannot check stale features, blocked agents, or failing CI on open PRs.
