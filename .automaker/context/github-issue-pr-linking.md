# GitHub Issue ↔ PR Linking

When creating pull requests that address GitHub issues, you MUST include closing keywords in the PR body so that merging the PR auto-closes the linked issue.

## Required Format

Use one of these keywords followed by the issue reference:
- `Closes #123`
- `Fixes #123`
- `Resolves #123`

For cross-repo or full URL references:
- `Closes https://github.com/proto-labs-ai/protoMaker/issues/123`

## What Does NOT Work

- A bare URL like `https://github.com/.../issues/123` — creates a visual link but does NOT auto-close
- Mentioning `#123` without a closing keyword — links but does NOT auto-close
- Putting the keyword only in the PR title — GitHub only parses the body and commit messages

## When Creating PRs Manually

If you use `gh pr create` or `gt submit`, always include the closing keyword in the `--body`:

```bash
gh pr create --title "fix: the thing" --body "## Summary\n\nFixed the thing.\n\nCloses #123"
```

## Automated PRs

The `git-workflow-service.ts` `buildPRBody()` helper automatically appends closing keywords when features have `githubIssueNumber`, `githubIssueUrl`, or issue URLs in their title/description. No manual action needed for auto-mode PRs.
