# Phase 1: Add role selector to Agent Runner

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a role dropdown to the agent config popover in the Agent Runner UI. When a role is selected, automatically set the model, max turns, and system prompt from ROLE_CAPABILITIES and the role's prompt template. Wire agentConfig to useElectronAgent (fixes the TODO on line 47).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view.tsx`
- [ ] `apps/ui/src/components/views/agent-view/components/agent-config-popover.tsx`

### Verification
- [ ] Role dropdown shows all defined roles including gtm-specialist
- [ ] Selecting a role sets model, maxTurns, systemPrompt automatically
- [ ] agentConfig is wired to useElectronAgent
- [ ] Can chat with GTM agent from UI

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
