# Phase 2: Build AntagonisticReviewer subgraph

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a reusable LangGraph subgraph that implements the critique-revise loop pattern. Takes content + rubric dimensions as input, uses LLM to score each dimension with chain-of-thought reasoning, returns structured scores and verdict (PASS/REVISE/FAIL). Uses XML output format. Max 2 retries. Configurable threshold.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/subgraphs/antagonistic-reviewer.ts`
- [ ] `libs/flows/src/content/prompts/antagonistic-review.md`
- [ ] `libs/flows/src/index.ts`

### Verification
- [ ] Subgraph accepts content + dimension rubric config
- [ ] LLM scores each dimension 1-10 with CoT reasoning via XML tags
- [ ] Returns structured ReviewResult with scores, verdict, and feedback
- [ ] PASS at >=75%, REVISE at <75%, FAIL after 2 retries
- [ ] Smart model for full review, fast model for structural checks
- [ ] Langfuse tracing on all LLM calls
- [ ] Works as standalone subgraph via wrapSubgraph()

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
