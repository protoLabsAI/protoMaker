# Phase 1: Types + Structured Plan Generator

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add structured plan types (StructuredPlan, PlanTask, AcceptanceCriterion, DeviationRule) to libs/types/src/lead-engineer.ts. Update StateContext with structuredPlan field. Implement structured plan generation in PlanProcessor using an engineered prompt that produces parseable JSON output with goal statement, acceptance criteria, task breakdown (file targets + verification commands), and deviation rules. Update plan validation to check structured fields. Preserve freeform fallback — if structured parsing fails, fall back to existing text plan behavior.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/types/src/lead-engineer.ts`
- [ ] `apps/server/src/services/lead-engineer-processors.ts`

### Verification

- [ ] StructuredPlan, PlanTask, AcceptanceCriterion, DeviationRule types exported from @protolabsai/types
- [ ] StateContext includes optional structuredPlan field
- [ ] PlanProcessor generates structured JSON plan via simpleQuery with engineered prompt
- [ ] Structured plan includes goal, acceptanceCriteria[], tasks[] (each with files[], verifyCommand), deviationRules[]
- [ ] Plan validation checks structured fields (goal present, at least 1 task, at least 1 acceptance criterion)
- [ ] Freeform text plan preserved as fallback when structured parsing fails
- [ ] npm run build:packages succeeds
- [ ] npm run typecheck succeeds

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
