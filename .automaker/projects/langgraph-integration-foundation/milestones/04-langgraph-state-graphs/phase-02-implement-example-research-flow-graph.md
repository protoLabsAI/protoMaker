# Phase 2: Implement example research flow graph

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Build a standalone research flow: START → gather_context → analyze → summarize → END. Use @automaker/llm-providers for models, @automaker/observability for tracing. Add MemorySaver checkpointer. Write integration tests. This is a proof-of-concept, not for production use.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/graphs/research-flow.ts`
- [ ] `libs/flows/src/graphs/nodes/gather-context.ts`
- [ ] `libs/flows/src/graphs/nodes/analyze.ts`
- [ ] `libs/flows/src/graphs/nodes/summarize.ts`
- [ ] `libs/flows/tests/integration/research-flow.test.ts`

### Verification
- [ ] Graph compiles and executes end-to-end
- [ ] Checkpointer saves state at each node
- [ ] Can resume from any checkpoint
- [ ] Integration test validates output
- [ ] Uses mocked LLM responses for tests

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
