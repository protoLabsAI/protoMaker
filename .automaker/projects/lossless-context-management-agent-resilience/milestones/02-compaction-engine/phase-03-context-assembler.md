# Phase 3: Context Assembler

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement budget-constrained context assembly. Fetch context_items, resolve summaries to structured XML and raw messages to content, apply budget with fresh tail protection, inject recall guidance when summaries present.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/context-engine/src/assembly/assembler.ts`
- [ ] `libs/context-engine/src/assembly/formatter.ts`
- [ ] `libs/context-engine/src/assembly/index.ts`

### Verification

- [ ] Assembly produces messages within token budget
- [ ] Fresh tail always included
- [ ] Summaries formatted as structured XML with metadata
- [ ] Oldest summaries dropped first when budget constrained
- [ ] Recall guidance injected when summaries present
- [ ] Token budget tracking reports headroom

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
