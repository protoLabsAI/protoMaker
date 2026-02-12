# Phase 1: Add Linear MCP to plugin and setuplab

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Linear MCP is already added to plugin.json. Update setuplab pipeline to provision Linear MCP in new protoLab environments. Add LINEAR_API_KEY to setup flow. Verify Linear MCP tools work (search issues, create issues, add comments).

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json`
- [ ] `apps/server/src/services/alignment-proposal-service.ts`
- [ ] `apps/server/src/routes/setup/index.ts`

### Verification
- [ ] Linear MCP tools available in Claude Code sessions
- [ ] setuplab provisions Linear MCP for new projects
- [ ] Can search and create Linear issues via MCP

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
