# Phase 2: Remove @ts-nocheck from remaining files and fix latent bugs

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove // @ts-nocheck from 9 remaining UI files. Fix parseAndCreateFeatures complexity 'moderate' bug (should be 'medium'). Fix TrustTierService per-request instantiation in quarantine.ts (use singleton from ServiceContainer).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/feature-detail.tsx`
- [ ] `apps/ui/src/components/views/interview-view.tsx`
- [ ] `apps/ui/src/components/views/github-issues-view.tsx`
- [ ] `apps/ui/src/components/views/settings-view/providers/claude-settings-tab.tsx`
- [ ] `apps/ui/src/components/views/setup-view/steps/cli-setup-step.tsx`
- [ ] `apps/ui/src/components/views/setup-view/steps/codex-setup-step.tsx`
- [ ] `apps/ui/src/components/views/settings-view/api-keys/hooks/use-api-key-management.ts`
- [ ] `apps/ui/src/components/views/github-issues-view/hooks/use-issue-validation.ts`
- [ ] `apps/ui/src/hooks/use-responsive-kanban.ts`
- [ ] `apps/server/src/routes/app-spec/parse-and-create-features.ts`
- [ ] `apps/server/src/routes/quarantine.ts`

### Verification
- [ ] Zero @ts-nocheck in entire apps/ui/src/
- [ ] 'moderate' replaced with 'medium'
- [ ] Singleton TrustTierService used
- [ ] npm run typecheck passes
- [ ] npm run test:all passes

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
