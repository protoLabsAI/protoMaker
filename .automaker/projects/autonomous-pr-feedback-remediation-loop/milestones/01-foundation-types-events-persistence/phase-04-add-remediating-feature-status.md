# Phase 4: Add 'remediating' feature status

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend Feature status type to include 'remediating' state and update status transition logic

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/feature.ts`
- [ ] `apps/server/src/services/feature-loader.ts`

### Verification
- [ ] Feature status union includes 'remediating'
- [ ] Status transition: review → remediating → review (on fixes) or done (on approval)
- [ ] Feature loader handles new status correctly
- [ ] UI can render remediating status (if feature-loader is only backend change, mark this N/A)

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 4 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 5
