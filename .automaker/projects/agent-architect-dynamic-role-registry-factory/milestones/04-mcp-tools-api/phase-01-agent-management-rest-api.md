# Phase 1: Agent Management REST API

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create apps/server/src/routes/agents/index.ts with REST endpoints: POST /api/agents/templates/list, POST /api/agents/templates/get, POST /api/agents/templates/register, POST /api/agents/templates/update, POST /api/agents/templates/unregister, POST /api/agents/execute. All endpoints require API key auth. Register/update/unregister enforce tier restrictions. Execute creates and runs a dynamic agent from a template. Follow existing route patterns (projectPath in body, error classification).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/agents/index.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] All 6 endpoints respond correctly
- [ ] Tier 0 roles rejected for update/unregister
- [ ] Invalid templates rejected with Zod error details
- [ ] Execute endpoint creates and runs agent, returns output
- [ ] API key authentication enforced
- [ ] Registered in server index.ts
- [ ] Unit tests for each endpoint

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
