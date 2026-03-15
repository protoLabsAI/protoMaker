# Phase 1: Build component playground

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a Vite-native component playground in packages/app with a /playground route. Ladle-inspired: fast startup, hot reload, component isolation. Features: component list sidebar, live preview panel, props editor (auto-generated from component schemas), viewport resizer, theme switcher (light/dark). Load components from the generated React output. Support CSF (Component Story Format) for custom stories.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/app/src/routes/playground.tsx`
- [ ] `libs/templates/starters/design-system/packages/app/src/components/playground/component-list.tsx`
- [ ] `libs/templates/starters/design-system/packages/app/src/components/playground/preview-panel.tsx`
- [ ] `libs/templates/starters/design-system/packages/app/src/components/playground/props-editor.tsx`

### Verification
- [ ] Component list shows all generated components
- [ ] Live preview renders selected component
- [ ] Props editor allows interactive prop changes
- [ ] Theme switcher toggles light/dark
- [ ] Viewport resizer works
- [ ] Fast startup (<2s)

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
