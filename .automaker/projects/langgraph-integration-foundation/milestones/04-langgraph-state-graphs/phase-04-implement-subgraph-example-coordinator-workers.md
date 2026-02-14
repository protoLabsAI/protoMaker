# Phase 4: Implement subgraph example (coordinator + workers)

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Build coordinator graph that delegates to 2 subgraphs (researcher, analyzer). Use message isolation pattern from proto-starter. Demonstrate Send for dynamic fan-out. Write tests for parallel and sequential execution.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/graphs/coordinator-flow.ts`
- [ ] `libs/flows/src/graphs/subgraphs/researcher.ts`
- [ ] `libs/flows/src/graphs/subgraphs/analyzer.ts`
- [ ] `libs/flows/src/graphs/utils/subgraph-wrapper.ts`
- [ ] `libs/flows/tests/integration/coordinator-flow.test.ts`

### Verification
- [ ] Coordinator delegates to subgraphs
- [ ] Subgraphs have isolated message state
- [ ] Results flow back to coordinator
- [ ] Send() enables dynamic parallelism
- [ ] 8+ integration tests pass

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
