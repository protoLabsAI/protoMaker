# Phase 3: End-to-End Testing & Documentation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write integration tests covering the full flow: register template → create agent → execute → verify output. Update docs/dev/adding-team-members.md to document the new dynamic approach alongside the static approach. Create docs/dev/agent-templates.md explaining the template schema, factory pattern, and MCP tools. Update CLAUDE.md with new MCP tools section.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/services/role-registry-service.test.ts`
- [ ] `apps/server/tests/unit/services/agent-factory-service.test.ts`
- [ ] `docs/dev/adding-team-members.md`
- [ ] `docs/dev/agent-templates.md`
- [ ] `CLAUDE.md`

### Verification
- [ ] Integration test: register → create → execute → verify
- [ ] Unit tests for registry, factory, executor
- [ ] adding-team-members.md updated with dynamic approach
- [ ] agent-templates.md documents schema and MCP tools
- [ ] CLAUDE.md lists new MCP tools
- [ ] npm run test:all passes
- [ ] npm run build succeeds

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
