# Phase 2: Large File Interception

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Intercept tool results exceeding 25K tokens. Store full content in large_files table. Replace with compact reference plus exploration summary. Agent can drill in via lcm_expand.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/context-engine/src/interception/large-file-handler.ts`
- [ ] `libs/context-engine/src/store/migrations.ts`
- [ ] `libs/context-engine/src/interception/index.ts`

### Verification

- [ ] Tool results >25K tokens intercepted automatically
- [ ] Full content stored with metadata
- [ ] Compact reference replaces original in context
- [ ] Agent can retrieve full content via lcm_expand
- [ ] Threshold configurable via WorkflowSettings
- [ ] Normal-sized results pass through unchanged

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
