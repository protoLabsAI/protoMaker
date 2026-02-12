# Phase 3: Update AgentHeader with agent identity

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update agent-header.tsx to show the selected agent's displayName and role instead of generic 'AI Agent'. When an agent template is selected, show '[displayName] - [role]' in the header. Update the welcome message in agent-view.tsx to be agent-specific: use the template's description or a greeting derived from the system prompt. Pass selectedAgentTemplate to AgentHeader.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view/components/agent-header.tsx`
- [ ] `apps/ui/src/components/views/agent-view.tsx`

### Verification
- [ ] Header shows selected agent name and role
- [ ] Welcome message changes per agent
- [ ] Falls back to 'AI Agent' when no template selected
- [ ] Config popover still accessible

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
