# Phase 2: Create monorepo skeleton and scaffold function

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the starter kit directory structure at libs/templates/starters/design-system/ with root package.json (npm workspaces). Packages: pen, codegen, tokens, color, a11y, xcl, registry, agents, mcp, app, server. Add scaffoldDesignSystemStarter() to scaffold.ts. Add design-system to StarterKitType. Wire all integration points.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/package.json`
- [ ] `libs/templates/src/types.ts`
- [ ] `libs/templates/src/scaffold.ts`
- [ ] `libs/templates/src/features.ts`
- [ ] `libs/templates/src/index.ts`
- [ ] `apps/server/src/routes/setup/routes/scaffold-starter.ts`
- [ ] `apps/ui/src/lib/templates.ts`

### Verification
- [ ] Starter directory with all packages
- [ ] scaffoldDesignSystemStarter copies and substitutes names
- [ ] StarterKitType includes design-system
- [ ] Template appears in UI picker
- [ ] npm run build:packages passes

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
