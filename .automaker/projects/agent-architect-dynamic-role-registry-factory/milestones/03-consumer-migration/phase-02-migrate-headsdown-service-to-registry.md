# Phase 2: Migrate Headsdown Service to Registry

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Refactor headsdown-service.ts getGoalsForRole() to use RoleRegistryService instead of exhaustive switch. Default headsdown configs loaded from templates instead of DEFAULT_HEADSDOWN_CONFIGS. Fallback config for roles without explicit headsdown settings. Keep DEFAULT_HEADSDOWN_CONFIGS as backward compatibility layer during migration — registry takes priority, falls back to static config.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/headsdown-service.ts`
- [ ] `libs/types/src/headsdown.ts`

### Verification
- [ ] All 8 existing roles get identical headsdown configs as before
- [ ] Dynamic roles get config from their template
- [ ] Roles without explicit config get sensible defaults
- [ ] DEFAULT_HEADSDOWN_CONFIGS still works as fallback
- [ ] Tests verify config parity for all existing roles

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
