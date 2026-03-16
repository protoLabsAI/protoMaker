# Git Workflow

protoLabs Studio follows a feature-branch workflow with branch protection on `main`. This guide covers branching strategies, commit conventions, PR processes, and git worktree isolation for agent execution.

## Branch Protection

**Never push directly to `main`.** All changes must go through pull requests, even for small fixes.

**Why:**

- Ensures code review for all changes
- Maintains clean commit history
- Prevents accidental breaking changes
- Enables CI/CD automation

## Feature Branch Strategy

### Standard Workflow

1. **Create a feature branch:**

```bash
git checkout main
git pull origin main
git checkout -b feature/my-feature-name
```

**Branch naming conventions:**

- `feature/` - New features or enhancements
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code restructuring
- `test/` - Test additions or updates

2. **Make your changes:**

```bash
# Edit files
# Run tests locally
npm run test:server
npm run test
```

3. **Commit with conventional commits:**

```bash
git add .
git commit -m "feat: add user authentication service"
```

See [Commit Conventions](#commit-conventions) below.

4. **Push and create PR:**

```bash
git push origin feature/my-feature-name
gh pr create --title "Add user authentication service" --body "..."
```

### Epic-Based Workflow

For larger features organized into epics, protoLabs Studio uses a hierarchical PR structure:

```
main
  ↑
epic/foundation ──────────── Epic PR (targets main)
  ↑         ↑         ↑
feat-a    feat-b    feat-c   Feature PRs (target epic branch)
```

**Creating an epic branch:**

```bash
git checkout main
git pull origin main
git checkout -b epic/my-epic-name
# Make initial commit (epic branches need at least one commit)
git commit --allow-empty -m "feat: initialize epic/my-epic-name"
git push origin epic/my-epic-name
```

**Creating a feature under an epic:**

```bash
git checkout epic/my-epic-name
git pull origin epic/my-epic-name
git checkout -b feature/child-feature
# Make changes
git push origin feature/child-feature
gh pr create --base epic/my-epic-name --title "Child feature"
```

**Merge order:**

1. Merge feature PRs into epic branch
2. Once all features complete, merge epic PR into main

## Git Worktree Isolation

protoLabs Studio executes AI agents in isolated git worktrees to protect the main branch during implementation.

### What is a Worktree?

A git worktree is a separate working directory linked to the same repository. protoLabs Studio uses worktrees to:

- **Isolate agent execution** - Agents work in `.worktrees/{branch-name}/`
- **Protect main branch** - Main codebase remains untouched during agent runs
- **Enable parallel work** - Multiple agents can work on different features simultaneously

### Automatic Worktree Creation

Worktrees are **auto-created** when an agent starts if one doesn't exist for the feature's branch:

```bash
# Worktrees are stored in:
{projectPath}/.worktrees/{branch-name}/
```

### Manual Worktree Management

If you need to manually work in a worktree:

```bash
# Create worktree
git worktree add .worktrees/my-branch -b my-branch

# Work in worktree
cd .worktrees/my-branch
# Make changes

# Return to main working tree
cd ../..

# Remove worktree
git worktree remove .worktrees/my-branch
```

## Commit Conventions

protoLabs Studio follows [Conventional Commits](https://www.conventionalcommits.org/) for clear commit history and automated changelog generation.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | Description                           | Example                                            |
| ---------- | ------------------------------------- | -------------------------------------------------- |
| `feat`     | New feature                           | `feat(auth): add JWT token validation`             |
| `fix`      | Bug fix                               | `fix(board): resolve drag-and-drop race condition` |
| `docs`     | Documentation                         | `docs: update MCP tools reference`                 |
| `refactor` | Code restructure (no behavior change) | `refactor(agent): extract prompt builder`          |
| `test`     | Test additions/updates                | `test(server): add unit tests for feature loader`  |
| `chore`    | Maintenance tasks                     | `chore: upgrade dependencies`                      |
| `perf`     | Performance improvements              | `perf(ui): optimize board render cycle`            |
| `style`    | Formatting/linting                    | `style: run prettier on all files`                 |

### Scope (Optional)

Scope indicates which package or area is affected:

```
feat(server): add new API endpoint
fix(ui): resolve button styling issue
docs(mcp): enhance tool examples
refactor(types): simplify Feature interface
```

### Breaking Changes

Mark breaking changes with `!` or `BREAKING CHANGE:` footer:

```
feat(api)!: rename /features to /board

BREAKING CHANGE: The /features endpoint is now /board. Update all API clients.
```

## Pull Request Process

### Creating a PR

1. **Push your branch:**

```bash
git push origin feature/my-feature
```

2. **Create PR via GitHub CLI:**

```bash
gh pr create \
  --title "Add user authentication service" \
  --body "## Summary
- Implement JWT token validation
- Add login/logout endpoints
- Update user types

## Test Plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manually tested login flow"
```

### PR Review Checklist

Before requesting review:

- [ ] **All tests pass** - `npm run test:all`
- [ ] **Build succeeds** - `npm run build:packages && npm run build:server`
- [ ] **Linter passes** - `npm run lint`
- [ ] **Formatter applied** - `npm run format`
- [ ] **Documentation updated** - If adding features, update docs
- [ ] **Commit history clean** - Squash WIP commits if needed
- [ ] **PR description complete** - Summary, test plan, breaking changes

### After PR Approval

Once approved, use GitHub's merge button or:

```bash
gh pr merge <pr-number> --squash
```

**Squash merge** is preferred to keep main branch history clean.

## Common Git Operations

### Update Your Branch with Main

```bash
git checkout main
git pull origin main
git checkout feature/my-feature
git merge main

# Or use rebase for linear history
git rebase main
```

### Fix Merge Conflicts

```bash
# After merge/rebase conflicts
git status  # See conflicted files
# Edit files to resolve conflicts
git add <resolved-files>
git commit  # Or git rebase --continue
```

### Undo Last Commit (Not Pushed)

```bash
git reset --soft HEAD~1  # Keep changes staged
git reset --mixed HEAD~1  # Keep changes unstaged
```

### View Commit History

```bash
git log --oneline --graph --decorate --all
# Or use gh CLI
gh pr list
gh pr view <number>
```

## Git Hooks

protoLabs Studio uses [Husky](https://typicode.github.io/husky/) for git hooks:

### Pre-Commit Hook

Runs linter and formatter before each commit:

```bash
# Defined in .husky/pre-commit
npm run lint
npm run format
```

If checks fail, commit is blocked. Fix issues and retry.

## Troubleshooting

### "Branch protection rules prevent push"

**Solution:** You tried pushing to `main`. Create a feature branch:

```bash
git checkout -b feature/my-fix
git push origin feature/my-fix
```

### "Diverged branches"

**Solution:** Your branch is out of sync with main:

```bash
git checkout feature/my-feature
git pull origin main --rebase
git push origin feature/my-feature --force-with-lease
```

### "Worktree already exists"

**Solution:** Clean up stale worktree:

```bash
git worktree remove .worktrees/old-branch
# Or if worktree is missing
git worktree prune
```

### "Cannot remove worktree with uncommitted changes"

**Solution:** Commit or stash changes first:

```bash
cd .worktrees/my-branch
git add .
git commit -m "WIP: save work"
cd ../..
git worktree remove .worktrees/my-branch
```

## Learn More

- [Monorepo Architecture](./monorepo-architecture.md) - Package structure and dependencies
- [CONTRIBUTING.md](https://github.com/protoLabsAI/protoMaker/blob/main/CONTRIBUTING.md) - Complete contribution guide
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message format
