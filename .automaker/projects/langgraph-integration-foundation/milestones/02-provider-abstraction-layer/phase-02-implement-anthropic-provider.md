# Phase 2: Implement Anthropic provider

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create AnthropicProvider class extending BaseLLMProvider. Implement getModel() with support for haiku/sonnet/opus. Add listAvailableModels(), healthCheck(). Write integration tests with mock API calls. Add default config for Anthropic models.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/llm-providers/src/server/providers/anthropic.ts`
- [ ] `libs/llm-providers/src/server/config/default-config.ts`
- [ ] `libs/llm-providers/tests/integration/anthropic.test.ts`
- [ ] `libs/llm-providers/tests/mocks/anthropic-api.ts`

### Verification
- [ ] AnthropicProvider.getModel('smart') returns ChatAnthropic with claude-sonnet-4-5
- [ ] Health check succeeds with valid API key
- [ ] Health check fails gracefully with invalid key
- [ ] Integration tests use mocked API
- [ ] 5+ tests pass

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
