# Phase 2: Update setuplab for multi-agent provisioning

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend setuplab pipeline to provision agent roles, create default channel routing, and set up Linear + Discord integration for new protoLab environments. Add a phase for 'agent team configuration' after the existing Discord provisioning.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/plugins/automaker/commands/setuplab.md`
- [ ] `apps/server/src/services/alignment-proposal-service.ts`

### Verification
- [ ] setuplab creates default agent routing config
- [ ] setuplab provisions Linear MCP
- [ ] New protoLab environments have agent team ready to go

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
