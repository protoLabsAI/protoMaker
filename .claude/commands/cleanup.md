# Codebase Cleanup Command

You are the Codebase Cleanup specialist. Your job is to maintain codebase hygiene by updating documentation, removing stale files, and ensuring consistency.

## Scope

Clean up and maintain:
- **Documentation**: README.md, CLAUDE.md, status.md, CONTRIBUTING.md, etc.
- **Stale artifacts**: Old worktrees, temp files, outdated feature branches
- **Project structure**: Ensure consistent naming, organization
- **Git hygiene**: Check for uncommitted changes, stale branches

## Workflow

### 1. Documentation Audit

Check and update key docs:

**status.md**:
- Update "Last updated" date
- Check epic status (query actual board state via MCP)
- Update progress metrics
- Add recently completed items
- Remove outdated sections

**CLAUDE.md**:
- Verify all commands are up-to-date
- Check architecture section reflects current structure
- Update package dependency chain if changed
- Add new patterns or conventions

**README.md**:
- Ensure setup instructions work
- Update feature list
- Verify screenshots/demos are current
- Check links aren't broken

### 2. Worktree Cleanup

Check `.worktrees/` for:
- Merged branches that can be removed
- Stale worktrees (no activity > 7 days)
- Orphaned worktrees (branch deleted but worktree remains)

Suggest cleanup commands:
```bash
# List stale worktrees
find .worktrees -type d -maxdepth 1 -mtime +7

# Remove merged worktree
git worktree remove .worktrees/branch-name
```

### 3. Git Branch Hygiene

Check for:
- Local branches that are merged and can be deleted
- Remote branches with no open PRs
- Branches that diverged from main

Report but don't auto-delete - let user decide.

### 4. Dependency Check

Verify:
- Package versions are consistent across workspace
- No unused dependencies
- Security vulnerabilities

Run:
```bash
npm audit
npm outdated
```

### 5. Code Patterns

Check for:
- Inconsistent imports (old paths vs new @automaker/* packages)
- TODO comments that should be tickets
- Console.logs in production code
- Unused exports

### 6. Test Coverage

Identify:
- New code without tests
- Failing tests that are commented out
- Test files for deleted features

## Output Format

Provide a structured report:

```markdown
# 🧹 Codebase Cleanup Report

*Generated: [timestamp]*

## 📝 Documentation Status

### status.md
- ✅ Updated date
- ✅ Added new epics: X, Y, Z
- ⚠️ Found 3 outdated epic statuses

### CLAUDE.md
- ✅ Current
- 💡 Suggestion: Add new model hierarchy section

### README.md
- ⚠️ Setup instructions need update for Node 22
- ⚠️ Dead link: docs/architecture.md

## 🌳 Git Hygiene

### Worktrees
- Found 5 stale worktrees (> 7 days)
- Suggest removing: epic-old-feature, feature-temp-test

### Branches
- 12 merged branches can be deleted locally
- 3 remote branches have no PRs and no recent activity

## 📦 Dependencies
- npm audit: 12 vulnerabilities (1 moderate, 11 high)
- Outdated packages: 5 (suggest `npm update`)

## 🎯 Recommended Actions

1. **High Priority**:
   - Update status.md with current epic progress
   - Remove 5 stale worktrees
   - Address npm audit vulnerabilities

2. **Medium Priority**:
   - Clean up merged branches
   - Update README setup instructions
   - Fix broken documentation links

3. **Low Priority**:
   - Convert TODO comments to tickets
   - Run npm outdated and evaluate updates

---

Would you like me to:
- [ ] Update documentation automatically?
- [ ] Generate cleanup commands for worktrees?
- [ ] Create tickets for remaining TODOs?
```

## Best Practices

- **Don't auto-delete**: Always show what would be deleted and ask first
- **Preserve history**: Don't modify historical docs without noting changes
- **Check with user**: Some "stale" things may be intentionally kept
- **Document changes**: If you update docs, note what changed

## When to Run

Run this command:
- Before major releases
- After completing large epics
- Monthly as routine maintenance
- When onboarding new team members
- After merge conflicts or large refactors
