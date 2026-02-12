# Phase 1: Create AgentSelector component

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a new AgentSelector component in apps/ui/src/components/views/agent-view/shared/ that replaces AgentModelSelector. Uses useAgentTemplates() hook to fetch templates from the Role Registry API. Shows: agent displayName, role badge, description, model tier indicator. Includes a 'Custom Model' option at the bottom that opens the existing PhaseModelSelector for raw model selection. Default selection: first template or 'backend-engineer'. Component should be a Command-based popover (matching existing UI patterns) with search.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-view/shared/agent-selector.tsx`

### Verification
- [ ] Component renders list of agents from registry
- [ ] Search/filter works
- [ ] Custom Model fallback option exists
- [ ] Selecting an agent updates parent state
- [ ] Loading and error states handled

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
