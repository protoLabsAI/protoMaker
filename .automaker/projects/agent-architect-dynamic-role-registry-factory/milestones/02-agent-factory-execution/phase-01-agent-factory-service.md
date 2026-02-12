# Phase 1: Agent Factory Service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create AgentFactoryService in apps/server/src/services/agent-factory-service.ts. Depends on RoleRegistryService. Methods: createFromTemplate(templateName, projectPath, overrides?) returns a configured agent-like object with resolved model, tools, system prompt. Validates overrides against schema. Supports template inheritance: custom template can extend a built-in template. Logs all agent creation events. Does NOT execute agents — just configures them.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-factory-service.ts`

### Verification
- [ ] createFromTemplate returns properly configured agent config
- [ ] Override merging works correctly (tools additive, model replacement)
- [ ] Template not found throws descriptive error
- [ ] Template inheritance resolves correctly
- [ ] All creation events logged
- [ ] Unit tests cover normal flow, overrides, inheritance, errors

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
