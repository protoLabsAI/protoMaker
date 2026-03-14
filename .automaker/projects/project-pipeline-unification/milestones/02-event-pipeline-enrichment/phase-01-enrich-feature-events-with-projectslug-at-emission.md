# Phase 1: Enrich feature events with projectSlug at emission

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In FeatureLoader.update() where feature:status-changed is emitted, the full feature object is already included (line 734). Verify that projectSlug flows through. Also check feature:started, feature:completed, and feature:error emission points in execution-service, auto-mode-service, and feature-state-manager to ensure they include projectSlug.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`
- [ ] `apps/server/src/services/auto-mode/feature-state-manager.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`
- [ ] `apps/server/src/services/completion-detector-service.ts`

### Verification
- [ ] All feature:* events include projectSlug in payload
- [ ] Event ledger entries have projectSlug for all feature events
- [ ] No regressions in existing event handling

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
