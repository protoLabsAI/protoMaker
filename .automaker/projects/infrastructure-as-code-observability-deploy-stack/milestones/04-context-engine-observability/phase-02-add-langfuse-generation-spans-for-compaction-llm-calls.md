# Phase 2: Add Langfuse generation spans for compaction LLM calls

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wrap compaction LLM calls (LeafCompactor, Condensation) with Langfuse generation spans capturing model, tokens, cost, latency. Pass LangfuseClient through context engine config from AgentSessionManager.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/compaction/leaf-compactor.ts`
- [ ] `libs/context-engine/src/compaction/condensation.ts`
- [ ] `apps/server/src/services/agent-session-manager.ts`

### Verification
- [ ] Compaction LLM calls appear as Langfuse generations
- [ ] Cost tracking works for compaction calls
- [ ] Graceful no-op when Langfuse unavailable
- [ ] npm run build:packages and npm run build:server pass

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
