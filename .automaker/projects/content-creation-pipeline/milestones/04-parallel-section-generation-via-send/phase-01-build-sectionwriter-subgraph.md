# Phase 1: Build SectionWriter subgraph

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create an isolated SectionWriter subgraph that generates a single content section. The subgraph receives: section spec from outline, relevant research findings, content style config, and model preference. It generates the section content with code examples where specified, validates output against the section schema, and returns the completed section. Includes model fallback chain (smart → fast) and retry on validation failure (max 2 retries). Each generation traced in Langfuse with section-level metadata.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/subgraphs/section-writer.ts`

### Verification
- [ ] SectionWriter subgraph with isolated state (message isolation pattern)
- [ ] Model fallback: smart model → fast model on failure
- [ ] Retry loop: max 2 retries on Zod validation failure
- [ ] Langfuse tracing per generation with section metadata
- [ ] Returns typed ContentSection with content, codeExamples, references
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
