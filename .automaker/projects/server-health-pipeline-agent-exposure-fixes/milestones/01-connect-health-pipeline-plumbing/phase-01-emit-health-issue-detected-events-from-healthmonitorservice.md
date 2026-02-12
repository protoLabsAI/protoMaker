# Phase 1: Emit health:issue-detected events from HealthMonitorService

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

HealthMonitorService at apps/server/src/services/health-monitor-service.ts detects issues (stuck_feature, high_memory_usage, corrupted_feature, etc.) but NEVER emits health:issue-detected. The event type is defined in libs/types/src/event.ts line 69, and AvaGatewayService subscribes to it at line 295.

After building the issues array (around line 246), emit health:issue-detected for each critical/warning issue BEFORE auto-remediation. Payload should include: type, severity, message, featureId (if applicable), metrics.

Files to modify:
- apps/server/src/services/health-monitor-service.ts — Add emit calls for each detected issue

Acceptance criteria:
- health:issue-detected emitted for each issue with severity 'critical' or 'warning'
- Emission happens BEFORE auto-remediation
- health:check-completed still emitted as before (don't break existing behavior)
- Server builds clean

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/health-monitor-service.ts`

### Verification
- [ ] health:issue-detected emitted for critical and warning issues
- [ ] Emission happens before auto-remediation
- [ ] health:check-completed still works as before
- [ ] npm run build:server passes

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
