# Phase 2: Build research dispatcher and aggregator

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the research dispatcher node that uses Send() to fan out to parallel workers based on content config (which research types are enabled). Create the research aggregator node that receives all findings via reducer, deduplicates, scores by relevance, and produces a consolidated ResearchSummary. Wire into a ResearchSubgraph using GraphBuilder.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/subgraphs/research-subgraph.ts`

### Verification
- [ ] Dispatcher returns Send[] based on enabled research types
- [ ] Aggregator deduplicates findings by content similarity
- [ ] ResearchSubgraph compiles with MemorySaver checkpointer
- [ ] Findings scored and sorted by relevance
- [ ] HITL interrupt after aggregation for research review
- [ ] Subgraph exported from @automaker/flows

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
