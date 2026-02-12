# Phase 2: Linear webhook handler for agent sessions

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement POST /api/linear/webhook endpoint to receive AgentSessionEvent webhooks. Parse delegation and mention events. Emit thought activity within 10 seconds. Route to appropriate agent based on project context (GTM project -> GTM agent, engineering project -> Ava).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/linear/webhook.ts`
- [ ] `apps/server/src/services/linear-agent-service.ts`

### Verification
- [ ] Webhook receives AgentSessionEvent
- [ ] Thought activity emitted within 10s
- [ ] Delegation routes to correct agent by project
- [ ] Mentions route to correct agent

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
