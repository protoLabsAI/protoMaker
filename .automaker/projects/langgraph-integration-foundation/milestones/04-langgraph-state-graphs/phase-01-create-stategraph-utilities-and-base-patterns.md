# Phase 1: Create StateGraph utilities and base patterns

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Build state annotation helpers, custom reducers (fileReducer, todoReducer from proto-starter), routing utilities. Create base graph builder with common patterns (ToolNode, conditional edges, checkpointer setup). Write unit tests for state merging logic.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/graphs/state-utils.ts`
- [ ] `libs/flows/src/graphs/reducers.ts`
- [ ] `libs/flows/src/graphs/routing.ts`
- [ ] `libs/flows/src/graphs/builder.ts`
- [ ] `libs/flows/tests/unit/state-utils.test.ts`
- [ ] `libs/flows/tests/unit/reducers.test.ts`

### Verification
- [ ] State annotations compile with Zod schemas
- [ ] Reducers correctly merge state updates
- [ ] Routing helpers support conditional edges
- [ ] 10+ unit tests pass
- [ ] TypeScript types are correct

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
