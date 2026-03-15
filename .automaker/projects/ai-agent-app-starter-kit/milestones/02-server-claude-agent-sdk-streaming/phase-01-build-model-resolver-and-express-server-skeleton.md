# Phase 1: Build model resolver and Express server skeleton

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/server/src/model-resolver.ts with multi-provider support (Anthropic via Claude Agent SDK, OpenAI, Google). Support aliases: haiku/sonnet/opus for Anthropic, gpt-4o/gpt-4o-mini for OpenAI, gemini-2.0-flash for Google. Create Express app factory in index.ts with CORS, JSON parsing, health endpoint.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/model-resolver.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/index.ts`

### Verification
- [ ] Model resolver maps aliases to provider instances
- [ ] Express server starts on configured port
- [ ] GET /api/health returns status ok
- [ ] Provider switching works via env vars

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
