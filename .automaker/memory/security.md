---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 1
  successfulFeatures: 1
---
# security

### Explicitly filtering to only resolve threads authored by known bots, leaving human review threads untouched (2026-02-10)
- **Context:** Automating thread resolution without human involvement - what prevents accidentally removing human feedback?
- **Why:** Human review threads could contain critical feedback or legal requirements (e.g., compliance checkoff). By white-listing only known bot accounts, we ensure human reviewers' threads are always preserved. Case-insensitive bot name matching catches both `coderabbitai` and `CodeRabbitAI` variants.
- **Rejected:** Resolve all threads - risks losing human feedback. Resolve based on thread content pattern - too fragile, could misidentify
- **Trade-offs:** Easier: safe by default, human threads always preserved. Harder: requires maintaining bot whitelist
- **Breaking if changed:** If filtering is removed, human reviewer feedback could be accidentally marked resolved - creates compliance/feedback loss risk

### EM agent uses configured mergeStrategy from gitWorkflow settings (squash/merge/rebase), not hardcoded strategy (2026-02-10)
- **Context:** Different teams have different merge policies. Monorepo squash, microservices merge, etc. Strategy should be configurable per project.
- **Why:** Projects have existing branch protection rulesets and commit history standards. Respecting configured strategy avoids conflicts with existing policies and unexpected history shapes.
- **Rejected:** Alternative: Hardcode squash strategy (mentioned in memory as preferred). Breaks projects using merge-commit strategy, creates inconsistent commit history.
- **Trade-offs:** Easier: Respects existing project policies. Harder: Strategy must be set up correctly in settings before merge works.
- **Breaking if changed:** If strategy is hardcoded, teams using non-squash strategies see unexpected commit history. PR merge succeeds but violates team commit policy, potentially breaking CI checks downstream.

#### [Pattern] Defense-in-depth for critical platform limitations: dual-layer guards (service-level + API-level) + agent prompt warnings. (2026-02-10)
- **Problem solved:** Single point of failure in worktree deletion could break entire user sessions. Need redundancy.
- **Why this works:** Multiple layers ensure the constraint is enforced regardless of code path: automated cleanup (service guard), manual deletion via UI (API guard), and agent awareness (prompt warnings). If one layer fails, others catch it.
- **Trade-offs:** Adds complexity and slight performance overhead (multiple checks), but prevents catastrophic failure mode (broken sessions). Cost is trivial compared to value.

#### [Pattern] Multi-layer safety checks before destructive operations: merge status verification → working directory state → current branch protection → force-only after all pass (2026-02-10)
- **Problem solved:** Auto-cleanup of stale worktrees and branches needs to prevent accidental data loss while operating autonomously without human approval
- **Why this works:** Single-layer checks can race or miss edge cases. Merge status alone doesn't guarantee safety if worktree has uncommitted work or is currently active. Layered approach catches all combinations of unsafe states
- **Trade-offs:** More code and function calls per cleanup, but provides complete safety guarantee. Performance cost is negligible (milliseconds) vs. risk of data loss

#### [Gotcha] Git worktree cannot be deleted while it is the current working directory in any process, even if that process will exit immediately after (2026-02-10)
- **Situation:** Attempting to cleanup worktrees from within a subprocess that might have cd'ed into the worktree path
- **Root cause:** Git worktree directory becomes locked by the process that owns the CWD. Operating system prevents directory deletion while it's in use by a process. In Claude Code specifically, if you `cd` into a worktree then try to delete it, the shell persists the broken CWD and all subsequent commands fail
- **How to avoid:** Must verify worktree is not current directory before any removal attempt. Adds runtime check but prevents silent failures and shell corruption