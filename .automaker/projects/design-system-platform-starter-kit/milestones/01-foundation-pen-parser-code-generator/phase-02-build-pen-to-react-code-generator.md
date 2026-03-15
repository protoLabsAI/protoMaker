# Phase 2: Build pen-to-React code generator

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/codegen/ with a pen-to-React pipeline. Takes a PenDocument AST, identifies component boundaries (reusable: true frames), and generates React component source code. For each reusable component: extract layout tree, convert frames to JSX divs with CSS flexbox, convert text nodes to styled spans, convert icon-fonts to Lucide imports, extract variables as CSS custom properties, generate prop interfaces from variable references. Output: .tsx files with co-located CSS modules or Tailwind classes.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/design-system/packages/codegen/src/react-generator.ts`
- [ ] `libs/templates/starters/design-system/packages/codegen/src/jsx-serializer.ts`
- [ ] `libs/templates/starters/design-system/packages/codegen/src/prop-extractor.ts`
- [ ] `libs/templates/starters/design-system/packages/codegen/src/import-generator.ts`
- [ ] `libs/templates/starters/design-system/packages/codegen/src/css-extractor.ts`

### Verification

- [ ] Generates valid .tsx files from .pen components
- [ ] Frames convert to divs with CSS flexbox
- [ ] Text nodes convert to styled spans
- [ ] Variables become CSS custom properties
- [ ] Props extracted from variable references
- [ ] Generated code compiles with tsc

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
