# Phase 4: Build WebSocket sideband for tool progress

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add WebSocket server (ws package) to the Express server for tool progress events. Create ToolProgressEmitter that rate-limits progress updates to 150ms. The sideband is optional — chat works without it.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/ws.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/tools/progress.ts`

### Verification

- [ ] WebSocket server runs alongside Express
- [ ] tool:progress events emitted during tool execution
- [ ] Rate limiting at 150ms works
- [ ] Chat functions without WebSocket connected

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 4 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 5
