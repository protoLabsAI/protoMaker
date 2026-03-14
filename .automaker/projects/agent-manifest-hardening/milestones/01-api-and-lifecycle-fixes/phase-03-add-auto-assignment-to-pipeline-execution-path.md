# Phase 3: Add auto-assignment to pipeline execution path

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

The pipeline execution path (executePipelineSteps) calls loadRolePromptPrefix but has no matchFeature auto-assignment step before it. Add the same auto-assignment logic used in the single-agent path.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`

### Verification
- [ ] Features entering pipeline path get auto-assigned role
- [ ] Pipeline role prompt reflects the auto-assigned role
- [ ] Single-agent path behavior unchanged

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
