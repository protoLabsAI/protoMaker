# Phase 2: Plan Consumer in ExecuteProcessor

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update ExecuteProcessor to parse structured plans and inject structured context into agent system prompts. Extract task list and file targets from structured plan. Format as clear instructions for the executor agent. Update PhaseHandoff to carry structured plan data through PLAN-to-EXECUTE transition. When structured plan is available, agent prompt includes explicit task checklist, file scope, and verification commands.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-execute-processor.ts`
- [ ] `libs/types/src/lead-engineer.ts`

### Verification

- [ ] ExecuteProcessor detects and parses structuredPlan from StateContext
- [ ] Agent system prompt includes formatted task checklist from structured plan
- [ ] Agent system prompt includes file scope (which files to modify)
- [ ] Agent system prompt includes verification commands to run before completing
- [ ] PhaseHandoff for EXECUTE includes structuredPlan reference
- [ ] Falls back to existing freeform plan injection when structuredPlan is absent
- [ ] npm run typecheck succeeds

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
