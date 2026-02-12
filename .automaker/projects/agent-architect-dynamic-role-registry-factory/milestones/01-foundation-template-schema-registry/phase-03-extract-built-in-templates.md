# Phase 3: Extract Built-in Templates

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extract existing 8 AgentRole definitions into JSON template files at .automaker/templates/built-in/. Create one JSON file per role: product-manager.json, engineering-manager.json, frontend-engineer.json, backend-engineer.json, devops-engineer.json, qa-engineer.json, docs-engineer.json, gtm-specialist.json. Each template includes: capabilities from ROLE_CAPABILITIES, headsdown config from DEFAULT_HEADSDOWN_CONFIGS, system prompt template reference, and tier designation (all built-in = tier 0 except gtm-specialist = tier 1). Templates must validate against AgentTemplateSchema.

---

## Tasks

### Files to Create/Modify
- [ ] `.automaker/templates/built-in/product-manager.json`
- [ ] `.automaker/templates/built-in/engineering-manager.json`
- [ ] `.automaker/templates/built-in/frontend-engineer.json`
- [ ] `.automaker/templates/built-in/backend-engineer.json`
- [ ] `.automaker/templates/built-in/devops-engineer.json`
- [ ] `.automaker/templates/built-in/qa-engineer.json`
- [ ] `.automaker/templates/built-in/docs-engineer.json`
- [ ] `.automaker/templates/built-in/gtm-specialist.json`

### Verification
- [ ] 8 JSON template files created matching existing ROLE_CAPABILITIES
- [ ] All templates validate against AgentTemplateSchema
- [ ] Tier 0 assigned to core roles, tier 1 to extensible roles
- [ ] Template loading test verifies all 8 load successfully
- [ ] Capability parity verified: registry.get('frontend-engineer').tools === ROLE_CAPABILITIES['frontend-engineer'].tools

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
