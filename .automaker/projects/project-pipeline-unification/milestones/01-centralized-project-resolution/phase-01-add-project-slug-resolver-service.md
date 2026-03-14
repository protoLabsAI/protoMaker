# Phase 1: Add project slug resolver service

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a lightweight service that resolves projectPath to a default projectSlug. For single-project installs, returns the sole project slug. For multi-project, uses a configurable default or returns undefined. Wire into ServiceContainer.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-slug-resolver.ts`
- [ ] `apps/server/src/server/services.ts`

### Verification
- [ ] resolveDefaultSlug(projectPath) returns correct slug for single-project installs
- [ ] Returns undefined when no default can be determined
- [ ] Service is registered in ServiceContainer

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
