# Phase 1: Build W3C DTCG token system

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/tokens/ implementing the W3C Design Tokens Community Group specification (2025.10 stable). Extract design tokens from .pen file variables into DTCG JSON format. Export to CSS custom properties, Tailwind config, and Style Dictionary format. Support theming (light/dark modes) via DTCG groups. Include token validation against the spec.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/design-system/packages/tokens/src/dtcg.ts`
- [ ] `libs/templates/starters/design-system/packages/tokens/src/extractor.ts`
- [ ] `libs/templates/starters/design-system/packages/tokens/src/exporters/css.ts`
- [ ] `libs/templates/starters/design-system/packages/tokens/src/exporters/tailwind.ts`

### Verification

- [ ] Tokens extracted from .pen variables in DTCG format
- [ ] CSS custom property export works
- [ ] Tailwind config export works
- [ ] Light/dark theme support
- [ ] Token validation against W3C spec

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
