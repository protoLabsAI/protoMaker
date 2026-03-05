# Phase 2: Message-level compaction and token budget

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a message-level compaction pass that runs before sending messages to Claude. Estimate token count per message, and when total exceeds a budget (e.g. 100K), compact older messages by summarizing tool results to one-line summaries and truncating long assistant responses. Add the estimateTokens() helper and compactMessageHistory() function.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/chat/message-compaction.ts`
- [ ] `apps/server/src/routes/chat/index.ts`

### Verification
- [ ] estimateTokens() provides reasonable estimates for message arrays
- [ ] compactMessageHistory() reduces token count below budget threshold
- [ ] Recent messages (last 10) are preserved verbatim
- [ ] Older tool results are replaced with one-line summaries
- [ ] Chat remains coherent after compaction
- [ ] TypeScript compiles cleanly

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
