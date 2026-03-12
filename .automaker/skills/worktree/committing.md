---
name: worktree-committing
description: Rules for committing in worktrees — never git add -A, run prettier first, stage specific files only.
metadata:
  author: agent
  created: 2026-03-12T00:00:00.000Z
  tags: [git, worktree, committing, prettier]
  source: learned
---

# Worktree Committing

Rules for safely staging and committing changes in git worktrees.

---

## Rule: Never Use `git add -A` or `git add .`

These commands capture runtime files in `.automaker/` (feature.json, agent-output.md). When the commit is merged, it can delete features from main because the branch snapshot didn't include them.

### BAD

```bash
# WRONG — captures .automaker/ runtime state, causes data loss on merge
git -C "$WORKTREE" add -A
git -C "$WORKTREE" add .
```

### GOOD

```bash
# Stage specific files by name
git -C "$WORKTREE" add src/server/routes/foo.ts libs/types/src/index.ts

# Or exclude .automaker/ explicitly when staging broadly
git -C "$WORKTREE" add -A -- ':!.automaker/'
```

---

## Rule: Run Prettier Before Committing

CI runs `npm run format:check` on every PR. Worktrees exclude `.prettierignore` paths differently — always format manually before committing.

### BAD

```bash
# WRONG — CI will fail format:check
git -C "$WORKTREE" add src/server/routes/foo.ts
git -C "$WORKTREE" commit -m "feat: add foo route"
```

### GOOD

```bash
# Format first, then stage and commit
npx prettier --write --ignore-path /dev/null \
  "$WORKTREE/src/server/routes/foo.ts" \
  "$WORKTREE/libs/types/src/index.ts"

git -C "$WORKTREE" add src/server/routes/foo.ts libs/types/src/index.ts
git -C "$WORKTREE" commit -m "feat: add foo route"
```

Server-side (`worktree-recovery-service.ts`, `git-workflow-service.ts`) uses:
`node "${projectPath}/node_modules/.bin/prettier" --ignore-path /dev/null`

---

## Rule: Persist Before In-Memory Mutation

Never mutate in-memory state before the persistence call succeeds. If the disk write throws, callers see the new status but disk has the old one.

### BAD

```bash
# In code: mutate first, persist second
feature.status = 'done';
await featureLoader.update(projectPath, feature.id, { status: 'done' });
```

### GOOD

```bash
# In code: persist first, mutate only on success
const prevStatus = feature.status;
try {
  await featureLoader.update(projectPath, feature.id, { status: 'done' });
  feature.status = 'done';
} catch (err) {
  feature.status = prevStatus;
  throw err;
}
```
