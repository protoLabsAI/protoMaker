# Phase 4: Add Groq, Ollama, Bedrock providers

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create GroqProvider, OllamaProvider, BedrockProvider classes. Implement with appropriate defaults. Add integration tests. Document provider capabilities and limitations in README.md.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/llm-providers/src/server/providers/groq.ts`
- [ ] `libs/llm-providers/src/server/providers/ollama.ts`
- [ ] `libs/llm-providers/src/server/providers/bedrock.ts`
- [ ] `libs/llm-providers/tests/integration/groq.test.ts`
- [ ] `libs/llm-providers/tests/integration/ollama.test.ts`
- [ ] `libs/llm-providers/tests/integration/bedrock.test.ts`
- [ ] `libs/llm-providers/README.md`

### Verification
- [ ] All 3 providers implement base interface
- [ ] Ollama works with local models
- [ ] Integration tests pass
- [ ] README documents each provider
- [ ] 15+ tests pass

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 4 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 5
