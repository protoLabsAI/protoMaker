# Recovery Runbooks

Operator/recovery-time procedures for blocked features. Extracted from CLAUDE.md (#3907) to keep the always-loaded instructions lean; the self-improvement rule appends new patterns here.

## Blocked Feature Recovery

When a feature blocks, check `statusChangeReason` immediately. Common patterns and fixes:

**"uncommitted work in worktree" / commit failed:**
The agent completed its work but the git workflow ran `git commit` without staging first. New files show as `??` (untracked) and modified files as ` M` in `git status`.

Recovery:

```bash
git -C /path/to/.worktrees/<branch> add -A
git -C /path/to/.worktrees/<branch> commit --no-verify -m "<feat/fix/refactor>: <title>"
```

Then use `create_pr_from_worktree` targeting `main`, move feature to `review`, enable auto-merge on the PR.

**Prettier check fails in CI (worktree path masking):**
Fixed at the source — `worktree-recovery-service.ts` and `git-workflow-service.ts` now use `node "${projectPath}/node_modules/.bin/prettier" --ignore-path /dev/null` instead of `npx prettier`. If you still hit this manually, use: `npx prettier --write <file> --ignore-path /dev/null`.

**Prettier check fails in CI (pre-existing formatting violations — passes locally but fails CI):**
Symptom: `npm run format:check` returns `Code style issues found in N files` on specific files, but running the same command locally reports `All matched files use Prettier code style!`. Same version, same config, same SHA.

Root cause: CI always runs a fresh `npm install` (exact version pins), while local `pnpm` may use a cached/prior prettier install or a globally installed prettier of a slightly different version. Files that were formatted by an older prettier and never re-checked can silently drift. CI catches this; local won't unless you explicitly re-run prettier write.

Common violations found: multi-line `import { x, }` that should be inline when the name fits under `printWidth: 100`; inline object property values (`description: 'long...'`) that exceed 100 chars and should be on a new line; escaped single-quotes (`\'`) that should use outer double-quotes.

Recovery:

```bash
# On the host machine (not in a worktree sandbox):
./node_modules/.bin/prettier --write <file1> <file2> ...
# Or from any environment with node:
node /path/to/project/node_modules/.bin/prettier --ignore-path /dev/null --write <files>
```

Prevention: After any merge or back-merge, run `npm run format:check` before opening a PR. This check runs first in the `checks` CI workflow and blocks merging.

**Feature blocked with "merge_conflict" / "unmerged files" (stuck MERGE_HEAD):**
A previous `git merge` failed with conflicts and left `.git/MERGE_HEAD` in the worktree. Every subsequent merge or stash attempt immediately fails with "Merging is not possible because you have unmerged files", creating an unrecoverable loop. The system now auto-clears this via `ensureCleanMergeState()` before each merge attempt (`libs/git-utils/src/rebase.ts`). If a feature is still stuck:

Recovery — clear the stuck merge state manually:

```bash
git -C /path/to/.worktrees/<branch> merge --abort
# If --abort fails:
git -C /path/to/.worktrees/<branch> reset --merge
```

Then reset `failureCount: 0` in `feature.json`, reset `status` to `backlog`, and call `start_agent`. The next run will call `ensureCleanMergeState()` automatically before the pre-flight merge.

**Root cause:** Pre-flight merge (`git merge origin/<prBaseBranch>`) was attempted on a worktree with a prior incomplete merge, leaving `MERGE_HEAD` present. Fixed by always calling `ensureCleanMergeState()` before any merge or stash operation.

**"has existing context, resuming" → agent exits immediately (stale context trap):**
Server logs show: `Feature <id> has existing context, resuming instead of starting fresh` followed immediately by `Feature <id> execution ended, cleaning up runningFeatures`. The previous run left an `agent-output.md` in `.automaker/features/<id>/`. The server tries to resume the dead Claude session, handshake fails silently, agent exits.

Recovery — rename stale files BEFORE retrying `start_agent`:

```bash
mv .automaker/features/<id>/agent-output.md .automaker/features/<id>/agent-output.md.stale
# Also clear any handoff files from the previous session:
mv .automaker/features/<id>/handoff-EXECUTE.json .automaker/features/<id>/handoff-EXECUTE.json.stale 2>/dev/null || true
```

Then reset `failureCount: 0` in `feature.json` and call `start_agent`. Resetting feature `status` alone is NOT enough — the stale output file is what triggers the resume path.

**Wrong branch prefix (feature/ instead of fix/):**
Agent-created fix/bug branches used `feature/` prefix instead of `fix/`. Root cause (fixed in PR #3346): `generateBranchName()` hardcoded `"feature/"` regardless of the feature's `category`.

Recovery — when a feature has a wrong-prefix branch:

```bash
# Create correctly-prefixed replacement branch targeting main
git checkout main && git pull origin main
git checkout -b fix/<slug>
git cherry-pick <bad-branch-sha>
git push origin fix/<slug>
gh pr create --base main --title "fix(ci): <title>"
# Close the bad PR
gh pr close <old-number> --comment "Replaced by #<new-number> with correct fix/ prefix"
```

Prevention: Always set `category: 'fix'` (or `'bug'`) when creating fix features via MCP — `branchPrefixForCategory()` will automatically use `fix/`. See `.automaker/memory/ops-lessons.md` for the full pattern.

**Stale ESCALATE checkpoint traps next dispatch (~40ms to blocked):**
Symptom: `start_agent` / `run-feature` returns success, but the feature flips to `blocked` in well under a second with `statusChangeReason: "Max agent retries exceeded: 3 attempts, limit 3"` even after you reset `failureCount: 0`. Server log shows `Checkpoint loaded for <id> at state ESCALATE` → immediate ESCALATE → no execution attempted. `failureCount` may even be 1 (not 3) on the feature, but the checkpoint has stale `retryCount: 3` in its context.

Root cause: `LeadEngineerStateMachine.processFeatureGraph()` enqueues a post-transition save of the ESCALATE checkpoint via the non-awaited `persistQueue`, then awaits `checkpointService.delete()`. The delete can run before the queued save, leaving a stale ESCALATE checkpoint on disk. Filed as P1 bug — `apps/server/src/services/lead-engineer-state-machine.ts` around lines 465 (save) and 583 (delete).

Recovery — dispatch a second time:

```bash
# 1) Reset feature
python3 -c "
import json
p = '.automaker/features/<featureId>/feature.json'
d = json.load(open(p))
d['failureCount'] = 0; d['status'] = 'backlog'; d['statusChangeReason'] = None
json.dump(d, open(p, 'w'), indent=2)
"
# 2) Dispatch — this run reaches ESCALATE again and deletes the stale checkpoint as terminal cleanup
curl -sS -X POST http://localhost:3008/api/auto-mode/run-feature \
  -H "Content-Type: application/json" -H "x-api-key: $AUTOMAKER_API_KEY" \
  -d '{"projectPath":"<absPath>","featureId":"<featureId>","useWorktrees":true}'
# 3) Reset feature again, dispatch again — this run starts clean from INTAKE
```

Alternative: delete the file directly if you can find it (it lives at `<projectPath>/.automaker/checkpoints/<featureId>.json`). It may have already been deleted by the most recent ESCALATE run — if so, only one fresh dispatch is needed.

**Self-improvement rule:** When you observe a recurring failure pattern that blocks agents, you MUST immediately:

1. File a P1 bug feature on the board describing the root cause and fix
2. Add the pattern to `ops-lessons.md` in memory
3. Add recovery steps here in CLAUDE.md

Do not just recover and move on. The flywheel only improves if failures are captured.
