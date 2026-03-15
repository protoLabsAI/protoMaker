# Phase 1: Create monorepo skeleton and scaffold function

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the starter kit directory structure at libs/templates/starters/ai-agent-app/ with root package.json (npm workspaces), packages/ui/, packages/server/, packages/app/ directories with their respective package.json and tsconfig.json files. Add scaffoldAiAgentAppStarter() to libs/templates/src/scaffold.ts with applyMonorepoSubstitutions() that patches @@PROJECT_NAME across all package.json files. Add ai-agent-app to StarterKitType union in types.ts. Export from index.ts.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/ai-agent-app/package.json`
- [ ] `libs/templates/src/types.ts`
- [ ] `libs/templates/src/scaffold.ts`
- [ ] `libs/templates/src/index.ts`

### Verification

- [ ] Starter directory exists with correct structure
- [ ] scaffoldAiAgentAppStarter copies files and substitutes @@PROJECT_NAME
- [ ] StarterKitType includes ai-agent-app
- [ ] npm run build:packages passes

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
