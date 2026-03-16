# Phase 1: Agent Service Integration

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Integrate ContextEngine into AgentService. On agent start: create/resume conversation keyed by feature ID. Each message exchange: ingest, compact check, assemble. Replace flat JSON sessions with context-engine-backed sessions. Backward compatible with existing sessions.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-service.ts`
- [ ] `apps/server/src/providers/claude-provider.ts`
- [ ] `apps/server/src/services/agent-session-manager.ts`

### Verification
- [ ] Agent sessions backed by context engine SQLite
- [ ] Compaction triggers automatically during long sessions
- [ ] Context assembly respects token budget each turn
- [ ] Feature ID maps to conversation ID for resume
- [ ] Existing sessions without context engine still load
- [ ] Agent retrieval tools available during execution

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
