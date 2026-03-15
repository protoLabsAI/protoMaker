# Phase 1: Integrate TinaCMS with Vite+React

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add TinaCMS to the starter kit. Configure for git-backed content (markdown + JSON in the repo). Set up content schema for: pages, component docs, design guidelines, changelog. Visual editing via useTina hook. Create a /site route for the public-facing documentation site with TinaCMS admin panel at /admin. Self-hosted mode (no TinaCloud dependency).

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/design-system/packages/app/tina/config.ts`
- [ ] `libs/templates/starters/design-system/packages/app/tina/schema.ts`
- [ ] `libs/templates/starters/design-system/packages/app/src/routes/site.tsx`
- [ ] `libs/templates/starters/design-system/packages/app/src/routes/admin.tsx`
- [ ] `libs/templates/starters/design-system/content/pages/index.md`

### Verification

- [ ] TinaCMS admin panel accessible at /admin
- [ ] Visual editing works with live preview
- [ ] Content stored as markdown/JSON in git
- [ ] Pages, component docs, guidelines content types
- [ ] Self-hosted mode (no external dependency)

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
