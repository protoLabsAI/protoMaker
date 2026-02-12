# Phase 2: Wire agentConfig to useElectronAgent

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Fix the TODO on line 47 of agent-view.tsx. Pass agentConfig.role, agentConfig.maxTurns, and agentConfig.systemPromptOverride to useElectronAgent. Update useElectronAgent to include these in the send API call. maxTurns should be passed as a session-level setting. systemPromptOverride should be appended to the system prompt.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view.tsx`
- [ ] `apps/ui/src/hooks/use-electron-agent.ts`

### Verification
- [ ] agentConfig.role passed to server on send
- [ ] agentConfig.maxTurns affects execution
- [ ] agentConfig.systemPromptOverride appended to prompt
- [ ] The TODO comment is removed

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
