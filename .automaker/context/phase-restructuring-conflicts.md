# Phase Restructuring Conflict Prevention

## Problem

When a project plan includes sequential phases where:
- **Phase N** modifies a file (adds content, updates metadata, changes frontmatter)
- **Phase N+1** deletes that same file and restructures it (e.g., flat `.md` file becomes a directory with `SKILL.md` + sub-files)

...Phase N's PR merges first, updating the file on the base branch. When Phase N+1's PR tries to merge, git sees a **modify/delete conflict**: the base branch has a modified version of the file, but Phase N+1's branch deleted it. This requires manual conflict resolution for every affected file.

This pattern is predictable at planning time and can be eliminated entirely.

## The Rule

**Never plan a phase that modifies a file when a subsequent phase will delete or restructure that same file.**

Instead, apply one of these strategies:

### Strategy 1: Batch Metadata Into Restructuring (Preferred)

Move all metadata changes (frontmatter updates, trigger descriptions, content additions) into the same phase that performs the structural decomposition. The restructuring phase already touches every file — adding metadata changes costs nothing and eliminates the conflict.

**Bad plan:**
```
Phase 1: Update trigger descriptions in all skill files    (modifies skill-a.md)
Phase 2: Decompose skills into directory structure          (deletes skill-a.md, creates skill-a/SKILL.md)
```

**Good plan:**
```
Phase 1: Decompose skills into directory structure with updated trigger descriptions
```

### Strategy 2: Order Metadata After Restructuring

If metadata changes must be a separate phase (e.g., different complexity, different expertise needed), schedule them AFTER the restructuring phase so they operate on the final file paths.

**Bad plan:**
```
Phase 1: Add type annotations to service.ts
Phase 2: Split service.ts into service/index.ts + service/helpers.ts
```

**Good plan:**
```
Phase 1: Split service.ts into service/index.ts + service/helpers.ts
Phase 2: Add type annotations to service/index.ts and service/helpers.ts
```

### Strategy 3: Serialize With Foundation Dependency

If ordering constraints prevent strategies 1 or 2, mark the modifying phase as `isFoundation: true` so the restructuring phase waits for its PR to fully merge before branching. This ensures the restructuring phase branches from a base that includes the modifications, producing a clean diff.

## Detection Checklist (For Plan Reviewers)

When reviewing a project plan's milestones and phases, check:

1. List all files each phase touches (from `filesToModify` or `description`)
2. For each file that appears in 2+ phases: does any later phase **delete, rename, or move** it?
3. If yes: does an earlier phase **modify** it?
4. If both: apply Strategy 1, 2, or 3 above

## Real-World Example

**Skills System Overhaul (March 2026)** — 3 epics, 7 phases:
- Phase "Prune dead skills" modified skill `.md` files (removed unused ones, updated remaining)
- Phase "Decompose flat skills" deleted those same `.md` files and created `skill-name/SKILL.md` directories
- Phase "Add trigger descriptions" modified skill files that decomposition would restructure

Result: 4 modify/delete merge conflicts requiring manual cherry-pick resolution across PRs #2374-#2377.

**Fix applied retroactively**: Merged conflict PRs manually by accepting deletions and porting missing content to the new directory structure.

**Fix at planning time**: Batch "prune" and "trigger description" changes into the "decompose" phase, or order metadata phases after decomposition.

## When to Apply

- Any project that restructures file organization (flat files to directories, monolith to modules)
- Any project that renames or moves files across phases
- Any refactoring project where early phases "prepare" files that later phases replace

Single-file modifications and additive-only phases (creating new files without deleting old ones) are not affected.
