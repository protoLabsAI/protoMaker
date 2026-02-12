# Phase 1: Wire CeremonyService into server

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Register CeremonyService in the server initialization (apps/server/src/index.ts or wherever services are initialized). Pass it the event emitter, FeatureLoader, ProjectService, and SimpleQueryService. Ensure it starts listening on server boot. Add trigger_ceremony MCP tool to packages/mcp-server/src/index.ts that allows manually triggering a milestone update or project retro (useful for testing and retroactive ceremonies). Tool params: projectPath, projectSlug, type ('milestone_update' | 'project_retro'), milestoneNumber (optional for milestone updates).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/index.ts`
- [ ] `packages/mcp-server/src/index.ts`
- [ ] `apps/server/src/routes/ceremony.ts`

### Verification
- [ ] CeremonyService instantiated and listening on server boot
- [ ] trigger_ceremony MCP tool available
- [ ] POST /api/ceremony/trigger route exists
- [ ] Manual trigger works for both milestone update and project retro
- [ ] npm run build:server && npm run build:packages succeeds

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
