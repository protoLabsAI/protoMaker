# Open a quick fix PR

This guide walks you through the full loop for landing a small bug fix or typo correction on this repo. You will cut a branch, make the change, push, and squash-merge to `main` after CI passes. It assumes you have the repo cloned and your editor set up.

## Find the problem

Spot the issue. For this example, you notice a typo in `docs/guides/custom-workflows.md` — "recieve" should be "receive".

## Cut a fix branch from main

```bash
git checkout main
git pull origin main
git checkout -b fix/typo-custom-workflows-receive
```

Branch names use the `fix/` prefix followed by a short slug. See `docs/internal/dev/branch-strategy.md` for the full branch model.

## Make the change and commit

```bash
# Edit the file
sed -i '' 's/recieve/receive/g' docs/guides/custom-workflows.md

git add docs/guides/custom-workflows.md
git commit -m "fix(docs): correct spelling of receive in custom-workflows"
```

Keep the commit message concise. Use the `fix:` prefix for bug fixes and typos.

## Push and open the PR

```bash
git push -u origin fix/typo-custom-workflows-receive
gh pr create --base main --title "fix(docs): correct spelling of receive in custom-workflows"
```

Target `main` directly. This repo uses a single-trunk flow — there is no `dev` or `staging` branch.

## Wait for CI and CodeRabbit

CI runs format, lint, type-check, and tests. CodeRabbit posts an automated review. Address any comments, then push fixes to the same branch.

## Squash and merge

Once all checks are green and CodeRabbit is satisfied:

```bash
gh pr merge --squash --auto
```

The `--auto` flag merges as soon as the last required check passes. The branch is deleted automatically after merge.
