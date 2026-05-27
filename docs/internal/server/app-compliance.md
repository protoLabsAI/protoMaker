# App Compliance Gate

Before protoMaker runs auto-mode for a managed app, it verifies the app meets the fleet standard — and **refuses to run** (with a clear operator message) if it doesn't, rather than silently operating an under-protected repo.

## What it checks

`checkAppCompliance(projectPath)` (`apps/server/src/services/app-compliance-service.ts`) returns `{ compliant, skipped, violations[] }`:

| Check               | Violation when…                                               | Remediation surfaced                                               |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `gitignore`         | the repo has no `.gitignore`                                  | add one (the create-protolab recommended baseline)                 |
| `branch-protection` | the default branch has **verified** no required status checks | apply branch protection requiring CI (the create-protolab ruleset) |

**Conservative by design:** a check counts as a _violation_ only when it is positively verified absent. When it can't be determined — no remote, `gh` unavailable, or an API/permission error — it is reported as _unverified_ and does **not** block. Refusing to run a legitimate local or limited-permission repo would be worse than the gap.

## Where it's enforced

The gate runs at the top of `AutoModeService.startAutoLoopForProject()` — before the synchronous slot claim, so the `await` doesn't reopen the TOCTOU window and a refusal leaves no loop state. On a violation it throws a message listing each problem + its fix; the start route surfaces that to the operator.

## Opt-out

Set **`AUTOMAKER_SKIP_COMPLIANCE_CHECK=1`** (truthy) to bypass the gate entirely. We suggest the standard; we don't fight an operator's existing system. The server test setup sets this so unit tests aren't blocked.

## Relationship to the merge gate

The compliance gate is **defense-in-depth**, not the primary safety. Even on a non-compliant repo, the platform-owned [merge gate](./github-merge-service.md) still refuses to merge a PR with pending or failing checks. The compliance gate ensures the _GitHub-side_ protections (required checks, branch protection) and repo hygiene (`.gitignore`) are also in place before the crew runs.

## Key files

- `apps/server/src/services/app-compliance-service.ts` — `checkAppCompliance`, `buildComplianceRefusalMessage`, `COMPLIANCE_SKIP_ENV`
- `apps/server/src/services/auto-mode-service.ts` — gate at `startAutoLoopForProject()`
