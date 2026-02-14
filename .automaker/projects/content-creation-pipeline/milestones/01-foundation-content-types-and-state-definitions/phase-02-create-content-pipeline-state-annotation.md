# Phase 2: Create content pipeline state annotation

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Define the LangGraph StateAnnotation for the content creation pipeline. Include fields for: research results (appendReducer for parallel collection), outline (replace), sections (appendReducer), reviews (appendReducer), content config (replace), HITL decisions (replace), generation metadata with Langfuse trace IDs, and error accumulation (appendReducer). Follow the reducer patterns from MythxEngine (concat for arrays) and Proto Starter (fileReducer for documents).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/state.ts`
- [ ] `libs/flows/src/index.ts`

### Verification
- [ ] State annotation uses Annotation.Root() with typed fields
- [ ] Array fields use appendReducer for parallel Send() safety
- [ ] Document fields use fileReducer pattern
- [ ] Default values provided for all fields with reducers
- [ ] State type exported for use in nodes
- [ ] Includes researchFindings, outline, sections, reviews, errors, config, hitlDecisions

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
