# Phase 1: Server Integration & Initialization

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wire RoleRegistryService and AgentFactoryService into the server startup in apps/server/src/index.ts. Initialize registry, load built-in templates, inject into services that need it (AgentDiscordRouter, HeadsdownService). Ensure backward compatibility — if registry fails to load, fall back to static definitions. Add health check info for registry status. Emit server event when registry is ready.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] Registry initializes on server start
- [ ] Built-in templates loaded automatically
- [ ] Services receive registry injection
- [ ] Fallback to static defs if registry fails
- [ ] Health check includes registry status
- [ ] Server starts cleanly with all tests passing

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
