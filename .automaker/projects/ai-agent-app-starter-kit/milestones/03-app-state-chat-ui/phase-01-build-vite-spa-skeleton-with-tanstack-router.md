# Phase 1: Build Vite SPA skeleton with TanStack Router

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/app with Vite 7 config, React 19, TanStack Router with file-based routing. Routes: / (chat), /sessions (session list), /settings (model + theme config). Create root layout with sidebar navigation. Set up Vite proxy to forward /api/* and /ws to the Express server.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/ai-agent-app/packages/app/vite.config.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/app/src/main.tsx`
- [ ] `libs/templates/starters/ai-agent-app/packages/app/src/routes/__root.tsx`

### Verification
- [ ] Vite dev server starts
- [ ] TanStack Router renders 3 routes
- [ ] Proxy forwards /api/* to Express server
- [ ] Root layout with sidebar renders

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
