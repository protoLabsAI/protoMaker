# Phase 2: Update Ava prompt — remove Discord polling, add DM awareness

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove the Discord polling step from Ava's monitoring checklist in ava.md. The bot now handles message routing automatically — Ava no longer needs to check #ava-josh on activation. Add DM awareness: Ava should know she can DM Josh via the discord_send_dm MCP tool for emergencies. Update the Discord channels section to note that message routing is event-driven. Remove the old #ava-josh polling reference.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/plugins/automaker/commands/ava.md`

### Verification
- [ ] Discord polling removed from monitoring checklist
- [ ] DM tool referenced in Ava's toolset
- [ ] Ava prompt is shorter and cleaner
- [ ] No references to manual Discord checking

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
