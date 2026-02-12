# Phase 1: Agent Template Schema (Zod)

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create AgentTemplateSchema in libs/types/src/agent-templates.ts using Zod. Define the template structure: name, displayName, description, role, model, tools, disallowedTools, systemPromptTemplate, trustLevel, maxRiskAllowed, canSpawnAgents, allowedSubagentRoles, tier (0=protected, 1=managed), hooks, author, version, tags. Export AgentTemplate type inferred from schema. Add to libs/types/src/index.ts exports. Ensure zod is already a dependency (it is in the monorepo).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/agent-templates.ts`
- [ ] `libs/types/src/index.ts`
- [ ] `libs/types/package.json`

### Verification
- [ ] AgentTemplateSchema validates correct templates
- [ ] AgentTemplateSchema rejects invalid templates (bad name format, invalid role, missing required fields)
- [ ] AgentTemplate type is exported from @automaker/types
- [ ] npm run build:packages succeeds
- [ ] Unit tests cover valid/invalid template validation

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
