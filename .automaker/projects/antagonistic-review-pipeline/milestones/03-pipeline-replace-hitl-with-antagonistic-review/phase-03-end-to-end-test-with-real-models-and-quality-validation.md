# Phase 3: End-to-end test with real models and quality validation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update the test script to run the full autonomous pipeline and validate output quality. Check that HTML entities are unescaped, no duplicate headings, content scores above threshold.

---

## Tasks

### Files to Create/Modify
- [ ] `scripts/test-content-flow.ts`

### Verification
- [ ] Test runs full pipeline end-to-end without HITL
- [ ] Validates no HTML entities in code blocks
- [ ] Validates no duplicate headings
- [ ] Validates antagonistic review scores >= 75%
- [ ] Output written to /tmp with quality report

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
