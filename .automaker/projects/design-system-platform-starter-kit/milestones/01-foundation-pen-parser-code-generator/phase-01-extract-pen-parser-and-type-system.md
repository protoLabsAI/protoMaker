# Phase 1: Extract .pen parser and type system

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/pen/ in the starter kit. Extract PenDocument, PenNode (15 node types), and all .pen types from libs/types/src/pen.ts. Extract parsePenFile, traverseNodes, findNodeById, findNodes, findReusableComponents, resolveVariable, resolveRef, extractTheme, buildComponentMap from libs/pen-parser/. Create style-utils module extracting PenFill/PenStroke to CSS conversion from designs-view renderer. Strip all @protolabsai imports. Include the shadcn-kit.pen as an example design file.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/pen/src/types.ts`
- [ ] `libs/templates/starters/design-system/packages/pen/src/parser.ts`
- [ ] `libs/templates/starters/design-system/packages/pen/src/traversal.ts`
- [ ] `libs/templates/starters/design-system/packages/pen/src/variables.ts`
- [ ] `libs/templates/starters/design-system/packages/pen/src/style-utils.ts`

### Verification
- [ ] All 15 PenNode types extracted
- [ ] parsePenFile parses .pen JSON correctly
- [ ] traverseNodes visits all nodes depth-first
- [ ] findReusableComponents identifies reusable: true frames
- [ ] resolveVariable resolves $--variable references
- [ ] Style utils convert fills/strokes to CSS
- [ ] Zero @protolabsai imports

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
