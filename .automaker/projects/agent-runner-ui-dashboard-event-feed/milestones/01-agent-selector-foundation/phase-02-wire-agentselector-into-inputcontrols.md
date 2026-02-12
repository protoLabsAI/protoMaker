# Phase 2: Wire AgentSelector into InputControls

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace AgentModelSelector with AgentSelector in input-controls.tsx (line 131). Update AgentView state to track selected agent template name instead of just model. When an agent is selected, auto-set the model from the template's model field. Pass selectedAgent to AgentInputArea and InputControls. Keep modelSelection state for the Custom Model fallback path.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view/input-area/input-controls.tsx`
- [ ] `apps/ui/src/components/views/agent-view.tsx`
- [ ] `apps/ui/src/components/views/agent-view/input-area/agent-input-area.tsx`

### Verification
- [ ] AgentSelector appears where model dropdown was
- [ ] Selecting an agent updates modelSelection automatically
- [ ] Custom Model option still works for raw model selection
- [ ] Build passes with no type errors

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
