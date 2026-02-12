# Phase 1: Health and settings MCP tools

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 3 MCP tools: get_detailed_health (calls /api/health/detailed for memory/stuck features/resources), get_settings (calls GET /api/settings/global), update_settings (calls PUT /api/settings/global). In packages/mcp-server/src/index.ts, add tool definitions and handlers. Settings tools need auth handling since endpoints are authenticated.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`

### Verification
- [ ] get_detailed_health returns memory usage and stuck feature count
- [ ] get_settings returns global config including auto-merge defaults
- [ ] update_settings modifies global settings and returns updated config
- [ ] All 3 tools work via MCP test

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
