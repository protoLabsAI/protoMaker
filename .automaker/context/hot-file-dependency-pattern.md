# Hot File Dependency Pattern

## Problem

Some files are **hot files** — touched by nearly every feature in an epic. When two parallel agents both modify a hot file, the second feature's PR will conflict after the first is squash-merged, because the squash creates a new synthetic commit that breaks the common ancestor.

**Hot files in this codebase:**
- `apps/server/src/server/wiring.ts` — every new service needs wiring
- `libs/types/src/event.ts` — every new event type added here
- `libs/types/src/index.ts` — every new type export
- `apps/server/src/server/services.ts` — every new service container entry

## Required: Rebase Before Implementing

**Before writing any code**, always fetch and rebase your branch onto the current epic or base branch HEAD:

```bash
git fetch origin
git rebase origin/<base-branch>
```

This ensures you're building on top of any changes already merged by parallel agents.

If the rebase has conflicts, resolve them by **keeping both sets of changes** (don't discard the other agent's work).

## Required: Serial Dependencies for Hot Files

When two or more features in an epic **both modify the same hot file**, they MUST be serialized with explicit dependencies. The later feature cannot start until the earlier one is fully merged (not just in review).

**How to check**: Look at your feature's `description` for `filesToModify`. If any other in-progress feature in your epic also lists the same file, your feature needs a dependency on it.

**Good example** (serialized correctly):
```
Feature A: adds DiscordChannelHandler to wiring.ts  →  Feature B: adds GitHubChannelHandler to wiring.ts
```
B must depend on A. B branches from the epic HEAD after A is merged — clean diff, no conflict.

**Bad example** (parallel conflict):
```
Feature A: adds DiscordChannelHandler to wiring.ts  ←→  Feature B: adds GitHubChannelHandler to wiring.ts
```
Both branch from the same base. First merge succeeds. Second needs manual cherry-pick to resolve.

## When You Encounter a Hot File Conflict

If you find your branch conflicts with the epic branch on a hot file:

1. **Don't rebase the full history** — the feature branch may carry old promotion commits that amplify conflicts
2. **Cherry-pick instead**: create a temp branch from the current epic HEAD, cherry-pick only your implementation commit
3. Keep both sets of changes in the hot file — never discard parallel work
4. Force-push to your feature branch, then re-merge
