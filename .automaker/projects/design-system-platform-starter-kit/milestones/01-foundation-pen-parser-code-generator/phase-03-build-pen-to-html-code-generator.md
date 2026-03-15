# Phase 3: Build pen-to-HTML code generator

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add HTML/CSS output target to packages/codegen/. Generates semantic HTML with CSS custom properties. Simpler than React output — no props, no imports, just clean HTML + CSS. Useful for static sites, email templates, and framework-agnostic output.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/codegen/src/html-generator.ts`
- [ ] `libs/templates/starters/design-system/packages/codegen/src/css-generator.ts`

### Verification
- [ ] Generates valid HTML from .pen components
- [ ] CSS uses custom properties for theming
- [ ] Output renders correctly in a browser
- [ ] Semantic HTML elements used where appropriate

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
