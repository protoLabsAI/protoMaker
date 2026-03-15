# Phase 2: Build streaming chat route with Claude Agent SDK

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/server/src/routes/chat.ts implementing POST /api/chat. Use Claude Agent SDK (streamText from ai package with @ai-sdk/anthropic) as the primary driver. Implement createUIMessageStream + pipeUIMessageStreamToResponse for streaming. Support multi-step agent loops with stepCountIs() limit. Handle tool execution within the stream.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/routes/chat.ts`

### Verification
- [ ] POST /api/chat returns text/event-stream
- [ ] Streaming responses work with useChat on client
- [ ] Multi-step agent loops work with stepCountIs limit
- [ ] Tool calls execute and stream results back

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
