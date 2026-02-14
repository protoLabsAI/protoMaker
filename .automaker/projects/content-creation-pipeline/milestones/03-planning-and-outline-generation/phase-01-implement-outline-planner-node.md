# Phase 1: Implement outline planner node

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create an outline planner node that takes the research summary and content config (type: blog/doc/training-data, target audience, tone, length) and generates a structured Outline with sections. Each section has: title, key points, estimated word count, required research references, suggested code examples. The outline serves as the dispatch manifest for parallel section generation. Use the outline-planner.md prompt template with Langfuse tracing via wrapProviderWithTracing.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/outline-planner.ts`

### Verification
- [ ] Produces typed Outline with Section[] array
- [ ] Each section has enough context for independent generation
- [ ] LLM call traced via @automaker/observability
- [ ] Prompt loaded via compilePrompt() with Langfuse fallback
- [ ] HITL interrupt for outline approval/modification
- [ ] Outline validates against Zod schema

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
