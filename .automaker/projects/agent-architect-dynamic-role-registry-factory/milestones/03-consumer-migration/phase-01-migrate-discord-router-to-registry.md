# Phase 1: Migrate Discord Router to Registry

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Refactor agent-discord-router.ts to use RoleRegistryService instead of hardcoded switch statements. getRolePrompt() becomes a registry lookup — get template, use its systemPromptTemplate to generate the prompt. getRoleTools() uses template.tools instead of ROLE_CAPABILITIES[role]. Add fallback to generic prompt for unregistered roles. Inject RoleRegistryService via constructor. Preserve exact same behavior for all 8 existing roles.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-discord-router.ts`

### Verification
- [ ] All 8 existing roles produce identical prompts and tools as before
- [ ] Custom/dynamic roles get their template-defined prompt and tools
- [ ] Unknown roles get generic fallback (not crash)
- [ ] Constructor accepts RoleRegistryService
- [ ] Tests verify parity with previous switch-based behavior

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
