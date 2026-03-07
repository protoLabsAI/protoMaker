# Phase 3: Bidirectional traceability verification test

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write an end-to-end integration test that verifies the full paper trail is traceable in both directions: (1) Forward: project → milestone → phase → feature → agent execution → PR → merge → done → archive. (2) Reverse: archived feature → event ledger → pipeline states → project phase → milestone → project. (3) Cross-reference: Langfuse traceIds on feature match event ledger entries. This test is the final validation that the entire lifecycle is connected.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/integration/services/lifecycle-traceability.integration.test.ts`

### Verification
- [ ] Forward trace: project→feature→execution→PR→done→archive verified
- [ ] Reverse trace: archive→events→pipeline→project verified
- [ ] Event ledger contains entries for every state transition
- [ ] Archived feature.json contains full statusHistory
- [ ] Metrics ledger contains completion entry
- [ ] Test passes with npm run test:server

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
