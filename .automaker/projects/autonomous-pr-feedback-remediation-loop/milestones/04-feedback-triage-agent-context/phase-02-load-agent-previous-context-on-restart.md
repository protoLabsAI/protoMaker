# Phase 2: Load agent previous context on restart

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Modify continuation prompt builder to include previous agent-output.md content so agent sees its own work

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Reads .automaker/features/{id}/agent-output.md
- [ ] Truncates if > 50k chars (keep last 40k to preserve recent context)
- [ ] Prepends previous context to feedback prompt with clear separator
- [ ] Prompt structure: previous work → separator → per-thread feedback → instructions
- [ ] Handles missing agent-output.md gracefully (first iteration)

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
