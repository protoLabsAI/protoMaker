# Phase 1: Implement research worker nodes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create three research worker nodes that execute in parallel via Send(): (1) WebResearchWorker - takes a research query, uses LLM to synthesize web findings into structured ResearchFinding objects; (2) CodebaseResearchWorker - analyzes codebase context relevant to the content topic; (3) ExistingContentWorker - checks for existing related content to avoid duplication and find cross-reference opportunities. Each worker returns findings via appendReducer. Include model fallback: if primary model fails, retry with next tier.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/research-workers.ts`

### Verification
- [ ] Three worker node functions with typed inputs/outputs
- [ ] Each returns ResearchFinding[] aggregated via appendReducer
- [ ] Model fallback chain: smart → fast on failure
- [ ] Graceful degradation: worker failure doesn't crash pipeline
- [ ] Error findings logged in state.errors via appendReducer
- [ ] Works with FakeChatModel for testing

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
