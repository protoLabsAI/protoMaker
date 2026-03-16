# Phase 1: Leaf Summarization

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement leaf compaction: when uncompacted messages exceed leafChunkTokens, group into chunks of leafMinFanout messages, send to Haiku with leaf-level prompt preserving file paths, commands, errors. Store summary with depth=0, link to sources, generate Expand footer. Three-level escalation: normal > aggressive > deterministic fallback.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/compaction/leaf-compactor.ts`
- [ ] `libs/context-engine/src/compaction/prompts.ts`
- [ ] `libs/context-engine/src/compaction/index.ts`

### Verification
- [ ] Leaf summaries compress 8+ messages into ~1200 token nodes
- [ ] Summary preserves file paths, commands, errors
- [ ] Expand footer lists compressed topics
- [ ] Source message links maintained
- [ ] Three-level escalation works
- [ ] Fresh tail never compacted

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
