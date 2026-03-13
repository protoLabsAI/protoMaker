---
name: ci
description: CI/CD pipeline rules — branch protection, checks, deploy, PR workflow, and format fixes. Use when PRs are stuck on auto-merge, CI checks fail, CodeRabbit blocks a merge, or format checks fail. Trigger on "PR not merging", "CI failing", "CodeRabbit", "auto-merge", "format check failed", "branch protection", "PR stuck", "deploy", or "direct commit".
tags: [ci, cd, github-actions, deployment, branch-protection, pr, coderabbit, auto-merge]
---

# CI/CD Patterns

Complete reference for the Automaker CI/CD pipeline and PR lifecycle. Each rule is documented in its own file below.

## Rules

| Rule | File | Description |
|------|------|-------------|
| Checks | [checks.md](./checks.md) | Required CI checks, common failures, and fixes |
| Deploy | [deploy.md](./deploy.md) | Deployment workflow and self-hosted runner config |
| PR Workflow | [pr-workflow.md](./pr-workflow.md) | Auto-merge, CodeRabbit, post-agent checklist |
| Branch Protection | [branch-protection.md](./branch-protection.md) | Ruleset config, direct commit restrictions |

## Quick Reference

### Fix a failing format check

```bash
npx prettier --write <file> --ignore-path /dev/null
```

### Enable auto-merge on a PR

```bash
gh pr merge <number> --auto --squash
```

### Trigger CodeRabbit review

```bash
gh pr comment <number> --body "@coderabbitai review"
```
