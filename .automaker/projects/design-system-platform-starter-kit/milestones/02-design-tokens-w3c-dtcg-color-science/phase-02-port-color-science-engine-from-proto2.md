# Phase 2: Port color science engine from proto2

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/color/ porting the LCH color science from proto2's @proto/utils. Include: 11-step color scale generation (50-950), color harmonies (complementary, triadic, analogous, split-complementary, tetradic), WCAG contrast checking and scoring, semantic color mapping (primary, secondary, destructive, muted, etc.), palette generation from a single accent color. All using LCH/Oklch for perceptual uniformity.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/color/src/scales.ts`
- [ ] `libs/templates/starters/design-system/packages/color/src/harmonies.ts`
- [ ] `libs/templates/starters/design-system/packages/color/src/contrast.ts`
- [ ] `libs/templates/starters/design-system/packages/color/src/palette.ts`
- [ ] `libs/templates/starters/design-system/packages/color/src/semantic.ts`

### Verification
- [ ] 11-step scales generated from any base color
- [ ] All harmony types produce valid palettes
- [ ] WCAG AA/AAA contrast ratios calculated correctly
- [ ] Semantic color mapping works
- [ ] Palette generation from single accent color

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
