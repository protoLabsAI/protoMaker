# Phase 1: Implement base provider interface and factory

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create BaseLLMProvider abstract class, ProviderFactory singleton, and model category types (fast/smart/reasoning/vision/coding). Add Zod schemas for provider config validation. Implement getProvider() and getModel() with caching. Write unit tests for factory pattern.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/llm-providers/src/server/providers/base.ts`
- [ ] `libs/llm-providers/src/server/factory/provider-factory.ts`
- [ ] `libs/llm-providers/src/server/config/schema.ts`
- [ ] `libs/llm-providers/src/server/config/types.ts`
- [ ] `libs/llm-providers/tests/unit/factory.test.ts`

### Verification
- [ ] ProviderFactory.getInstance() returns singleton
- [ ] getModel('fast', 'anthropic') returns ChatAnthropic
- [ ] Config schema validates successfully
- [ ] 10+ unit tests pass
- [ ] No dependencies on existing Automaker code

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
