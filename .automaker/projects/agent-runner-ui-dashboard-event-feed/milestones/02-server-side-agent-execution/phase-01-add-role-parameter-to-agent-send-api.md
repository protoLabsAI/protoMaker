# Phase 1: Add role parameter to agent send API

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update the POST /api/agent/send endpoint and AgentService.sendMessage() to accept an optional 'role' parameter (agent template name). When provided, resolve the template from RoleRegistryService, use its systemPrompt (prepended to existing system prompt), tools (as allowedTools), and model (as default, overridable). Update useElectronAgent hook to pass the role from agentConfig. This fixes the TODO on line 47 of agent-view.tsx.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-service.ts`
- [ ] `apps/server/src/routes/agent/send.ts`
- [ ] `apps/ui/src/hooks/use-electron-agent.ts`

### Verification
- [ ] AgentService accepts role parameter
- [ ] Template system prompt is prepended when role is set
- [ ] Template tools restrict available tools when role is set
- [ ] Template model used as default when role is set
- [ ] Existing sessions without role continue to work unchanged

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
