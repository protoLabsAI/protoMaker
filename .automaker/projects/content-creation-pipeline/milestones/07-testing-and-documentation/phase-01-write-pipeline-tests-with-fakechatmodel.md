# Phase 1: Write pipeline tests with FakeChatModel

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create comprehensive tests for the content creation pipeline: (1) Unit tests for each node (research workers, outline planner, section writer, reviewers, output generators); (2) Integration test for complete flow with FakeChatModel providing deterministic responses; (3) HITL interrupt/resume test verifying checkpoint persistence; (4) Parallel Send() test verifying reducer aggregation; (5) Model fallback test simulating primary model failure. All tests use FakeChatModel - zero real API calls.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/tests/unit/content-types.test.ts`
- [ ] `libs/flows/tests/unit/content-nodes.test.ts`
- [ ] `libs/flows/tests/integration/content-creation-flow.test.ts`

### Verification
- [ ] Unit tests for all node functions
- [ ] Integration test runs complete pipeline with FakeChatModel
- [ ] HITL interrupt/resume cycle tested
- [ ] Parallel aggregation verified (Send + reducer)
- [ ] Model fallback verified
- [ ] All tests pass with npm run test:packages
- [ ] Zero real API calls in test suite

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
