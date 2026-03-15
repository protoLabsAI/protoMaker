# Phase 1: Wire into scaffold system and add starter features

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update all integration points: features.ts (5 starter features), scaffold-starter.ts server route, templates.ts UI entry, setup-client.ts type, create-protolab scaffold.ts. Add getAiAgentAppStarterContext to starters.ts.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/src/features.ts`
- [ ] `libs/templates/src/starters.ts`
- [ ] `apps/server/src/routes/setup/routes/scaffold-starter.ts`
- [ ] `apps/ui/src/lib/templates.ts`
- [ ] `apps/ui/src/lib/clients/setup-client.ts`
- [ ] `packages/create-protolab/src/phases/scaffold.ts`

### Verification

- [ ] Scaffold route accepts ai-agent-app
- [ ] Template appears in UI picker
- [ ] 5 starter features populate the board
- [ ] npm run build:packages passes
- [ ] npm run typecheck passes

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
