# Phase 2: Agent Management MCP Tools

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 7 MCP tools to packages/mcp-server/src/index.ts: list_agent_templates, get_agent_template, register_agent_template, update_agent_template, unregister_agent_template, execute_dynamic_agent, get_role_registry_status. Each tool calls the corresponding REST API endpoint. Include proper input schemas with descriptions. Follow existing MCP tool patterns (projectPath param, error handling, response formatting).

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`

### Verification
- [ ] All 7 MCP tools registered and callable
- [ ] Input schemas validate correctly
- [ ] Tier restrictions enforced through API
- [ ] register_agent_template validates template before sending
- [ ] execute_dynamic_agent returns agent output
- [ ] npm run build:packages builds successfully
- [ ] MCP tools appear in dist/index.js

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
