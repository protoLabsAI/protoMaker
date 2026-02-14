# Phase 1: Wire TechnicalReviewer to LLM with technical-reviewer.md prompt

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace the stub technicalReviewerNode with a real LLM call using the technical-reviewer.md prompt template. Parse XML response into ReviewFinding[] with severity levels.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/review-workers.ts`
- [ ] `libs/flows/src/content/prompts/technical-reviewer.md`

### Verification
- [ ] technicalReviewerNode makes real LLM call with technical-reviewer.md prompt
- [ ] Response parsed via XML tags into ReviewFinding[]
- [ ] Falls back to heuristic checks if LLM call fails
- [ ] Langfuse tracing on LLM call

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
