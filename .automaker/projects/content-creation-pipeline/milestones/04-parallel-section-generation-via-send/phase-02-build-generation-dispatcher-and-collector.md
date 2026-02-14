# Phase 2: Build generation dispatcher and collector

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the generation dispatcher that takes the approved outline and returns Send() objects for each section, routing to the SectionWriter subgraph. Create the collector node that receives all sections via appendReducer, orders them according to the outline, and validates completeness. Handle partial failure: if some sections fail, report which ones and allow retry.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/generation-dispatch.ts`

### Verification
- [ ] Dispatcher returns Send[] with one per outline section
- [ ] Each Send includes section spec + relevant research subset
- [ ] Collector orders sections by outline position
- [ ] Partial failure handling: reports missing sections
- [ ] Section count matches outline section count
- [ ] Total generation traced as parent span in Langfuse

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
