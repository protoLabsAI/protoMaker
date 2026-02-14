# Phase 3: Wire FactChecker to LLM with fact-checker.md prompt

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace the stub factCheckerNode with a real LLM call using fact-checker.md prompt. Cross-references content against research findings.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/review-workers.ts`
- [ ] `libs/flows/src/content/prompts/fact-checker.md`

### Verification
- [ ] factCheckerNode makes real LLM call with fact-checker.md prompt
- [ ] Cross-references content against research findings from state
- [ ] Response parsed via XML tags into ReviewFinding[]
- [ ] Falls back to heuristic checks if LLM call fails

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
