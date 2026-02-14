# Phase 2: Parse agent thread decisions from output

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

After agent run, parse agent-output.md to extract per-thread decisions (accept/deny/clarify + reasoning)

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Regex or markdown parser extracts decision table from agent output
- [ ] Maps threadId → {decision, reasoning}
- [ ] Validates all threads were addressed by agent
- [ ] Stores decisions in feature.threadFeedback array
- [ ] Logs unparseable or missing decisions as warnings

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
