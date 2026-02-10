# Phase 1: Global auto-merge setting toggle

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Enable autoMergePR by default in git workflow settings. Add MCP tool to toggle per-feature. Change DEFAULT_GIT_WORKFLOW_SETTINGS in libs/types/src/settings.ts to set autoMergePR: true. Add update_feature_git_settings MCP tool for per-feature control.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/settings.ts`
- [ ] `packages/mcp-server/src/tools/feature-tools.ts`

### Verification
- [ ] autoMergePR defaults to true
- [ ] Per-feature override works via MCP

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
