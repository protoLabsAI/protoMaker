# Phase 3: Emit feature lifecycle events from status changes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Several services subscribe to feature:started, feature:stopped, and feature:blocked events, but these are never emitted. Only the generic feature:status-changed is emitted by FeatureLoader.

Subscribers expecting these events: escalation-router.ts:148-150 listens for feature:blocked. event-subscriptions.module.ts:16-44 listens for feature:stopped. event-hook-service.ts maps feature:started, feature:stopped, feature:blocked.

Fix: In FeatureLoader.update() (around line 747-758), after emitting feature:status-changed, also emit the specific lifecycle event based on new status: in_progress emits feature:started, blocked emits feature:blocked, done emits feature:stopped. Include featureId, featureTitle, projectPath, previousStatus, newStatus in payload.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/feature-loader.ts`

### Verification

- [ ] feature:started emitted when feature status changes to in_progress
- [ ] feature:blocked emitted when feature status changes to blocked
- [ ] feature:stopped emitted when feature status changes to done
- [ ] escalation-router feature:blocked handler receives events
- [ ] Existing feature:status-changed event still emitted
- [ ] npm run typecheck passes
- [ ] npm run test:server passes

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
