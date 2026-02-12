# Phase 3: MCP tools for worktree management

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 3 MCP tools wrapping existing worktree routes: list_worktrees (calls /api/worktree/list), get_worktree_status (calls /api/worktree/status), create_pr_from_worktree (calls /api/worktree/create-pr). All routes already exist, just need MCP wrappers in packages/mcp-server/src/index.ts following apiCall() pattern.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`

### Verification
- [ ] list_worktrees returns array of worktree paths and branches
- [ ] get_worktree_status returns git status for specific worktree
- [ ] create_pr_from_worktree commits, pushes, creates PR in one call
- [ ] All 3 tools work via MCP test

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
