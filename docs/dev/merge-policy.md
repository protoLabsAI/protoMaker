---
title: Merge Policy & Stacked PRs
description: When to squash, when to merge-commit, and how to keep a stack of PRs healthy.
---

# Merge Policy & Stacked PRs

This page covers the merge-button rule for protoLabs repos and the git hygiene that keeps stacked PRs from rebase-fighting you. If you only ship one-off PRs against `main`, you can read the [TL;DR](#tl-dr) and stop. If you ship stacks, read the whole page once and configure your local git.

## TL;DR

| When                                                   | Use                       |
| ------------------------------------------------------ | ------------------------- |
| One-off PR targeting `main` (or `dev` where it exists) | **Squash** (status quo)   |
| Stacked PR (base is another PR's branch)               | **Create a merge commit** |
| Anything else                                          | Squash                    |

Plus one local git config for everyone:

```bash
git config --global rebase.updateRefs true
```

That's the whole policy. The rest of this page explains why and how to recognize the case you're in.

## Why this changed

Squash-merge collapses a PR's commits into a single new commit with a fresh SHA on the base branch. When PR B is stacked on PR A and A gets squash-merged, B's history still references A's original commit SHAs. Git's rebase algorithm can't tell which commits are "already on the base as part of the squash" vs "still need to apply" — so it tries to re-apply them, hitting conflicts that should have been mechanical.

Merge commits don't have this problem. The original commit SHAs are preserved on the base, so when you rebase the next stacked PR, git correctly identifies what's already upstream.

We were paying this cost every time we shipped a stack. The fix is one repo settings change and one workflow rule.

## How to recognize a stacked PR

The PR header on GitHub shows the base branch:

```
chore/foo wants to merge 3 commits into chore/bar
```

If you see anything other than `main` (or `dev` on repos that still use it) after "into", it's a stacked PR. Use **Create a merge commit** when you land it.

## Local git config

One-time per machine:

```bash
git config --global rebase.updateRefs true
```

This single setting saves most of the manual stack-rebase work. When you `git rebase` one branch, git automatically moves dependent branch refs forward — exactly what you'd hand-rebase otherwise.

Verify:

```bash
git config --global --get rebase.updateRefs
# should print: true
```

## Stack hygiene

If you're the one stacking PRs, three habits make life easier.

### Don't enable auto-merge until the stack stops moving

Auto-merge captures the head SHA at the moment you click it. If you then rebase the branch, auto-merge fires against the old SHA and skips your new commits. We hit this and lost two PRs' worth of content silently — a recovery PR was needed. Hold off on `--auto` until the whole stack is stable.

### Don't squash-merge a parent PR while children are still open

GitHub deletes the head branch on merge (`delete_branch_on_merge: true`). A child PR whose `base` was that branch will fail to open or render with `Base ref must be a branch` — the parent's branch no longer exists.

Two ways out, both before merging the parent:

1. **Preferred** — keep **Create a merge commit** for the parent (the policy default for stacked PRs anyway). The parent branch's commit SHAs stay reachable on `main`, the child's `base` ref still resolves, and you can land the child without rebasing.
2. **If you've already squash-merged** — rebase the child onto `main` and re-target it: `git rebase --onto origin/main <old-parent-branch> <child-branch>` then `gh pr edit <child-pr> --base main` (or just open a fresh PR against `main`). One detail: when invoking `git rebase --onto X Y Z`, pass the branch _name_ as `Z`, not `HEAD` — `HEAD` puts you in detached state and your branch ref doesn't move.

### Rebase the bottom first, let `updateRefs` cascade

When `main` advances, rebase the bottom of your stack first and let `rebase.updateRefs` move the dependents forward. If a conflict forces a manual rebase in the middle of the stack, use:

```bash
git rebase --onto <new-base> <old-base>
```

…rather than relying on git's default upstream-detection — the default gets confused with merged-and-squashed predecessors.

## Reading the resulting history

Some people see merge commits as noise on `main`. They aren't, if you read with the right flag.

```bash
# Default — every commit, including the ones that came in via merge-commit branches
git log

# Just the main-line PRs — one entry per merged PR, same view as squash-only
git log --first-parent main

# Same, with a graph
git log --first-parent --graph --oneline main
```

A useful alias:

```bash
git config --global alias.mlog "log --first-parent --graph --oneline"
# usage: git mlog main
```

## Repo settings (admin)

The settings below are already configured on `protoMaker`. Copy them to other active repos.

### Org-level defaults

[github.com/organizations/protoLabsAI/settings/member_privileges](https://github.com/organizations/protoLabsAI/settings/member_privileges) → **Repository defaults → Pull Requests → Allow merge button options**:

- Allow merge commits — **on**
- Allow squash merging — **on**
- Allow rebase merging — **on**
- Default merge button — **Squash** (matches the one-off rule)

### Per-repo

`https://github.com/protoLabsAI/<repo>/settings` → **Pull Requests**:

- Allow merge commits — **on**, message format **PR title** for the commit subject and **PR body** for the commit message
- Allow squash merging — **on**, default
- Allow rebase merging — **on**

### Branch protection check

`https://github.com/protoLabsAI/<repo>/settings/branches` (or **Rules** for newer repos):

- Verify `Require linear history` is **off** on `main` (and `dev`/`staging` if present). On = merge commits forbidden, regardless of merge-button settings.

You can verify via the API too:

```bash
gh api repos/protoLabsAI/<repo>/rulesets/<id> \
  --jq '.rules[] | select(.type == "required_linear_history")'
# Empty output = not enforced. Good.
```

## FAQ

**Why not just use rebase-merge for stacked PRs?**

Rebase-merge rewrites the parent pointers of every commit in the PR, generating new SHAs. Same root problem as squash from a stacking perspective — the next PR in the stack can't recognize what's already upstream. Only merge commits preserve SHAs.

**Won't this make `git blame` worse?**

No. `git blame` walks the commit graph regardless of merge style. Merge commits are transparent to it.

**Won't the `main` branch's commit count balloon?**

The raw count goes up because individual commits in stacked PRs aren't squashed. `git log --first-parent main` gives you the squashed-style view whenever you want it, and most tooling (GitHub UI, IDE git panels) already shows what you'd expect. The trade-off is real but small.

**What if I disagree and want to squash my stacked PRs anyway?**

You'll burn an hour every time the stack rebases. We've done that. The policy lets you make the call but the team default is **merge commit for stacks**.

**Are there tools that automate this further?**

Yes:

- [`git-spice`](https://abhinav.github.io/git-spice/)
- [`git-branchless`](https://github.com/arxanas/git-branchless)
- [`spr`](https://github.com/ejoffe/spr)

All open-source. Not required, but they make stacks meaningfully nicer if you do them often. Graphite is the paid version — same shape, also fine.

## Rollout checklist

When applying this to a new repo:

- [ ] Repo settings updated (Pull Requests section)
- [ ] Branch protection / rulesets verified (no `required_linear_history` on `main`)
- [ ] Team briefed on the merge-button rule
- [ ] Every contributor sets `git config --global rebase.updateRefs true`

## Related

- [Git Workflow](./git-workflow) — branching strategy + commit conventions
