# Phase 1: Add thread evaluation instructions to prompt

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend feedback prompt to require agent to evaluate each thread critically and output decision in structured format

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Prompt includes evaluation criteria (does it improve code? is it aligned with project goals? is it feasible?)
- [ ] Instructions require agent to output decisions in markdown table: ThreadID | Decision | Reasoning
- [ ] Agent must justify BOTH accepts and denials
- [ ] Clear examples of good vs bad feedback included in prompt
- [ ] Agent can mark threads as 'needs-clarification' with questions

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
