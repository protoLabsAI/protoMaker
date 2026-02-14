# Phase 3: Integrate with llm-providers for automatic tracing

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add tracing middleware for @automaker/llm-providers. Every model.invoke() automatically creates a Langfuse trace. Support trace context propagation, custom metadata, cost tracking. Write integration tests combining both packages.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/observability/src/langfuse/middleware.ts`
- [ ] `libs/llm-providers/src/server/factory/provider-factory.ts`
- [ ] `libs/observability/tests/integration/provider-tracing.test.ts`

### Verification
- [ ] getModel() returns model wrapped with tracing
- [ ] Every invoke() creates a Langfuse span
- [ ] Token usage and cost tracked
- [ ] Tracing can be disabled via config
- [ ] Integration tests verify end-to-end flow

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
