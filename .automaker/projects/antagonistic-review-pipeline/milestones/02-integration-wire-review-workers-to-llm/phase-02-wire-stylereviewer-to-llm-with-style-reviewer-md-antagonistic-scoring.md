# Phase 2: Wire StyleReviewer to LLM with style-reviewer.md antagonistic scoring

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace the stub styleReviewerNode with a real LLM call using the style-reviewer.md prompt with 8-dimension antagonistic scoring rubric. This is the primary quality gate for blog content.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/review-workers.ts`
- [ ] `libs/flows/src/content/prompts/style-reviewer.md`

### Verification
- [ ] styleReviewerNode makes real LLM call with full 8-dimension rubric
- [ ] Scores returned as structured XML (dimension, score, evidence, suggestion)
- [ ] Verdict computed: PASS (>=75%), REVISE (<75%), FAIL (<50%)
- [ ] Auto-fail conditions enforced (headline <4, hook <4, scannability <5)
- [ ] Falls back to heuristic checks if LLM call fails

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
