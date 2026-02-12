# Phase 1: Add agent management MCP tools

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add MCP tools for managing role-based agents: list_agent_roles (returns available roles and capabilities), configure_agent_routing (set channel/user routing), get_agent_status (which agents are active and what they're working on). These become the MCP surface for the agent builder UI.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`
- [ ] `apps/server/src/routes/agents/index.ts`

### Verification
- [ ] list_agent_roles MCP tool returns all roles with capabilities
- [ ] configure_agent_routing MCP tool sets Discord routing
- [ ] get_agent_status MCP tool shows active agents

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
