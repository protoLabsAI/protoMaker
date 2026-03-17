# Phase 1: Point OTel and Langfuse to local instance

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update env config to point LANGFUSE_BASE_URL to local Langfuse. Add OTel DiagConsoleLogger to surface export failures. Verify traces land. Update docs.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/lib/otel.ts`
- [ ] `docs/self-hosting/deployment.md`

### Verification
- [ ] OTel traces land in local Langfuse
- [ ] DiagConsoleLogger surfaces export errors in logs
- [ ] Agent execution creates visible traces

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
