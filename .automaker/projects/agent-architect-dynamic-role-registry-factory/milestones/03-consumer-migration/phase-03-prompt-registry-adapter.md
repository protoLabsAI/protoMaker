# Phase 3: Prompt Registry Adapter

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a prompt registry adapter in libs/prompts/src/prompt-registry.ts. Maps role names to their prompt generation functions with a unified interface. Adapter wraps each existing prompt function (getProductManagerPrompt, etc.) with a common signature: (config: BasePromptConfig & Record<string, unknown>) => string. Built-in prompts register on module import. Custom prompts loaded from template systemPromptTemplate strings. Export getPromptForRole(role: string, config: BasePromptConfig) function.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/prompts/src/prompt-registry.ts`
- [ ] `libs/prompts/src/index.ts`

### Verification
- [ ] getPromptForRole returns correct prompt for all 8 existing roles
- [ ] Custom roles with systemPromptTemplate strings generate valid prompts
- [ ] Unknown roles return generic prompt (not throw)
- [ ] Exported from @automaker/prompts
- [ ] Unit tests verify all 8 built-in role prompts

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
