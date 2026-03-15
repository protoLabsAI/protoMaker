# Phase 2: Build auto-generated documentation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a /docs route with auto-generated component documentation. For each component: props table (from TypeScript interface), usage examples (from .pen composition), design token references, accessibility notes, related components. Use the .pen file metadata and generated code as sources. Render docs with markdown + live component embeds.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/design-system/packages/app/src/routes/docs.tsx`
- [ ] `libs/templates/starters/design-system/packages/app/src/components/docs/props-table.tsx`
- [ ] `libs/templates/starters/design-system/packages/app/src/components/docs/usage-example.tsx`
- [ ] `libs/templates/starters/design-system/packages/codegen/src/docs-generator.ts`

### Verification

- [ ] Props table auto-generated from TypeScript
- [ ] Usage examples from .pen compositions
- [ ] Design token references linked
- [ ] Live component embeds work
- [ ] Markdown rendering for custom docs

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
