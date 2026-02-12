# Phase 2: UI Role Selector Enhancement

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update the Agent Runner UI component to fetch available roles from the registry API instead of hardcoding AgentRole values. Show template metadata (displayName, description, tier badge). Allow selecting custom roles alongside built-in roles. Add visual indicator for tier 0 (locked icon) vs tier 1 (editable). Preserve existing UX — just extend the data source.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/agent-runner-view.tsx`
- [ ] `apps/ui/src/hooks/queries/use-agent-templates.ts`
- [ ] `apps/ui/src/lib/http-api-client.ts`

### Verification
- [ ] Role selector shows all registered roles (built-in + custom)
- [ ] Template metadata displayed (name, description, tier)
- [ ] Tier 0 roles show locked indicator
- [ ] Selecting a role correctly configures the agent
- [ ] Graceful fallback if API unavailable (show static list)

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
