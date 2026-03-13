# Phase 2: Add platform helpers for research paths

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add getResearchMdPath(projectPath, slug) and getResearchArtifactDir(projectPath, slug) helper functions to libs/platform/src/projects.ts. These return the paths for research.md and the research-report artifact directory respectively.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/platform/src/projects.ts`

### Verification
- [ ] getResearchMdPath() returns correct path to .automaker/projects/{slug}/research.md
- [ ] getResearchArtifactDir() returns correct path to .automaker/projects/{slug}/artifacts/research-report/
- [ ] Functions exported from @protolabsai/platform
- [ ] TypeScript compiles with zero errors

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
