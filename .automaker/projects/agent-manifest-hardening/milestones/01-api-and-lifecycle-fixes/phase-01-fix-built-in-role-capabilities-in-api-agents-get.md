# Phase 1: Fix built-in role capabilities in /api/agents/get

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When /api/agents/get falls back to a synthetic built-in agent, getResolvedCapabilities returns null because the agent isn't in the manifest cache. Add direct ROLE_CAPABILITIES lookup as fallback so built-in roles always return their capabilities.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/agents.ts`

### Verification
- [ ] GET a built-in role returns non-null capabilities object
- [ ] GET a project-manifest agent still works as before
- [ ] Existing tests pass

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
