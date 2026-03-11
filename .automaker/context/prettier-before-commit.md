# Prettier Before Commit

**CRITICAL: Always run prettier on modified files before committing.**

## Why This Matters

CI runs `npm run format:check` (prettier) on every PR. Agent commits that skip prettier
formatting will fail CI with a `format:check` error. This has caused failures on multiple
PRs (#2210, #2211, and others).

## Required Step Before Every `git commit`

Before running `git commit` (or any equivalent commit command), you MUST run prettier on
all files you have modified or created:

```bash
# Format all modified/staged files before committing
npx prettier --write <file1> <file2> ...

# Or format all staged files at once
git diff --name-only --cached | xargs npx prettier --write --ignore-unknown
```

## Workflow

1. Make your code changes
2. Stage files: `git add <files>`
3. **Run prettier on staged files:**
   ```bash
   git diff --name-only --cached | xargs npx prettier --write --ignore-unknown
   ```
4. Re-stage any files prettier modified: `git add <files>`
5. Commit: `git commit -m "..."`

## Alternative: Format Then Stage

```bash
# Format first, then stage
npx prettier --write <file1> <file2> ...
git add <file1> <file2> ...
git commit -m "..."
```

## Notes

- `--ignore-unknown` prevents prettier from failing on binary or unsupported file types
- prettier is already installed — use `npx prettier` to run it
- The CI check uses `prettier --ignore-path .prettierignore --check .` — the `--write`
  flag applied to your changed files achieves the same result for those files
- This applies to ALL commits, whether in a worktree or the main repo
