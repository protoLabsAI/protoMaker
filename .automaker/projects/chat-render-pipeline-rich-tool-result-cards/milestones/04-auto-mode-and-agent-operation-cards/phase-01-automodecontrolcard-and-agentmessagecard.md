# Phase 1: AutoModeControlCard and AgentMessageCard

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create AutoModeControlCard shared by start_auto_mode and stop_auto_mode — shows action taken (started/stopped), current configuration (max concurrency, model tier), and queue depth. Distinct from existing get_auto_mode_status card which shows ongoing status. Create AgentMessageCard for send_message_to_agent — shows the message sent, target feature/agent, and delivery confirmation. Register both.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/ui/src/ai/tool-results/auto-mode-control-card.tsx`
- [ ] `libs/ui/src/ai/tool-results/agent-message-card.tsx`
- [ ] `libs/ui/src/ai/tool-invocation-part.tsx`

### Verification
- [ ] AutoModeControlCard shows start/stop action with config details
- [ ] AgentMessageCard shows message sent to agent with delivery status
- [ ] Both registered in tool-invocation-part.tsx
- [ ] Build passes

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
