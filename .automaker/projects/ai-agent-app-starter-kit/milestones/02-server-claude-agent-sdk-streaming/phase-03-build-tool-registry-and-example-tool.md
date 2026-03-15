# Phase 3: Build tool registry and example tool

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/server/src/tools/registry.ts with ToolDefinition interface (name, description, parameters via zod, execute function, requiresConfirmation flag). Create example get_weather tool with requiresConfirmation: true. Wire tool registry into the chat route.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/tools/registry.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/tools/example.ts`

### Verification

- [ ] ToolDefinition interface with zod parameters
- [ ] register/list/get functions work
- [ ] get_weather example with requiresConfirmation
- [ ] Tools available to AI in chat route

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
