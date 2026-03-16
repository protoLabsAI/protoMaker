# Phase 2: Deviation Rule Engine

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement DeviationRuleService that evaluates agent scope against per-feature constraints. Rules are loaded from the structured plan's deviationRules field. Four rule categories matching GSD's model: (1) Auto-fix bugs discovered during implementation, (2) Auto-fix missing critical functionality that blocks the stated goal, (3) Auto-fix blocking issues (imports, type errors) in files within scope, (4) Escalate architecture changes, new external dependencies, or scope expansion. Rules are injected into agent system prompts as explicit instructions via the context loader. In v1, enforcement is advisory. Add deviation rule defaults to workflow settings (pipeline.defaultDeviationRules).

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/deviation-rule-service.ts`
- [ ] `libs/types/src/lead-engineer.ts`
- [ ] `libs/types/src/workflow-settings.ts`
- [ ] `apps/server/src/services/lead-engineer-execute-processor.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification

- [ ] DeviationRuleService created with loadRules() and formatForPrompt() methods
- [ ] Four default rule categories: auto-fix-bugs, auto-fix-critical, auto-fix-blocking, escalate-architecture
- [ ] Rules loaded from structured plan deviationRules or workflow settings defaults
- [ ] formatForPrompt() returns clear agent instructions with examples for each rule category
- [ ] ExecuteProcessor injects formatted deviation rules into agent system prompt
- [ ] Default rules configurable via pipeline.defaultDeviationRules in workflow settings
- [ ] New service wired in apps/server/src/server/wiring.ts
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
