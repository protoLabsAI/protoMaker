# Phase 2: Remove research flow stubs and clean up console.log

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete 4 hardcoded stub nodes (draft.ts, gather-context.ts, analyze.ts, summarize.ts). Remove createResearchFlow graph and graph registry entry. Replace console.log with createLogger in libs/flows/src/ (40+ instances) and libs/platform/src/subprocess.ts (12 instances). Remove debug console.log from app-store.ts and agent-output-modal.tsx.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/graphs/nodes/draft.ts`
- [ ] `libs/flows/src/graphs/nodes/gather-context.ts`
- [ ] `libs/flows/src/graphs/nodes/analyze.ts`
- [ ] `libs/flows/src/graphs/nodes/summarize.ts`
- [ ] `libs/flows/src/graphs/index.ts`
- [ ] `libs/flows/src/index.ts`
- [ ] `apps/server/src/lib/graph-registry.ts`
- [ ] `libs/platform/src/subprocess.ts`
- [ ] `apps/ui/src/store/app-store.ts`
- [ ] `apps/ui/src/components/views/board-view/dialogs/agent-output-modal.tsx`

### Verification
- [ ] Stub nodes deleted, graph removed
- [ ] Zero console.log in libs/flows/src/
- [ ] Zero console.log in subprocess.ts
- [ ] Debug logs removed from UI
- [ ] npm run build:packages passes
- [ ] npm run test:all passes

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
