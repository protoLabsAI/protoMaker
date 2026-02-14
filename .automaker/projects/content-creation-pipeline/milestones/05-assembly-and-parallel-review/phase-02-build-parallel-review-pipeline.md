# Phase 2: Build parallel review pipeline

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create three review worker nodes that execute in parallel via Send(): (1) TechnicalReviewer - checks code examples compile, API references are accurate, technical claims are supported; (2) StyleReviewer - checks tone consistency, readability, audience appropriateness; (3) FactChecker - cross-references claims against research findings. Each returns ReviewFinding[] via appendReducer. Review findings aggregated with severity (info/warning/error) for HITL decision.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/review-workers.ts`
- [ ] `libs/flows/src/content/subgraphs/review-subgraph.ts`

### Verification
- [ ] Three review workers execute in parallel via Send()
- [ ] Each returns ReviewFinding[] with severity levels
- [ ] Findings aggregated via appendReducer
- [ ] HITL interrupt for final approval with review summary
- [ ] User can approve, request revisions, or reject
- [ ] Review traced in Langfuse with reviewer metadata

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
