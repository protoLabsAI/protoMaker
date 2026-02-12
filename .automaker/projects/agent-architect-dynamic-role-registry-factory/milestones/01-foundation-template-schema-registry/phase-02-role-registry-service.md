# Phase 2: Role Registry Service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create RoleRegistryService in apps/server/src/services/role-registry-service.ts. Implements in-memory Map<string, AgentTemplate> with register(), get(), has(), list(), unregister() methods. Loads built-in templates from JSON files on initialization. Validates all templates against AgentTemplateSchema on registration. Enforces tier restrictions: tier 0 roles cannot be unregistered or modified. Emits events on registration/unregistration for UI reactivity. Singleton pattern — one registry per server instance.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/role-registry-service.ts`

### Verification
- [ ] Registry loads built-in templates on init
- [ ] register() validates template and stores it
- [ ] register() rejects duplicate names
- [ ] unregister() refuses tier 0 roles
- [ ] get() returns template or undefined
- [ ] list() returns all registered templates
- [ ] Events emitted on register/unregister
- [ ] Unit tests cover all methods and edge cases

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
