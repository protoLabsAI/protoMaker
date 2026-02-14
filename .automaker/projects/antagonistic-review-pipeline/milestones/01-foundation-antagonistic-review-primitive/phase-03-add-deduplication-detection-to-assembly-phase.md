# Phase 3: Add deduplication detection to assembly phase

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a post-assembly validation step that checks for duplicate headings and high content similarity between sections. Flags issues that the antagonistic reviewer should catch.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/nodes/assembler.ts`

### Verification
- [ ] Detects exact duplicate H2/H3 headings across sections
- [ ] Detects high content similarity (>60% keyword overlap) between sections
- [ ] Returns structured warnings in assembly output
- [ ] Does not block assembly — just flags issues for review phase

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
