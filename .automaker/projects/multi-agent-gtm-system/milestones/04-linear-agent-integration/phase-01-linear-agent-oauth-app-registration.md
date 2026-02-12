# Phase 1: Linear Agent OAuth app registration

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Register Automaker as a Linear agent app with actor=app OAuth flow. Implement OAuth authorize and callback routes. Store workspace tokens. Request app:assignable and app:mentionable scopes. Follow the weather-bot pattern.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/linear/index.ts`
- [ ] `apps/server/src/routes/linear/oauth.ts`

### Verification
- [ ] OAuth flow works — can authorize Automaker in Linear
- [ ] Access token stored per workspace
- [ ] Agent appears in Linear's agent list

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
