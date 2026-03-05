# Phase 1: AvaConfig MCP field and chat route wiring

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add mcpServers?: MCPServerConfig[] to AvaConfig in apps/server/src/routes/chat/ava-config.ts and the DEFAULT_AVA_CONFIG. In apps/server/src/routes/chat/index.ts, after loading avaConfig, convert ava-specific mcpServers using the existing getMCPServersFromSettings pattern (or inline conversion) and pass them to streamText as additional mcpServers. In apps/server/src/routes/chat/ava-tools.ts, update the options passed to execute_dynamic_agent so inner agents can also access ava-configured MCP servers when delegated from Ava chat. Import MCPServerConfig from @protolabsai/types.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/chat/ava-config.ts`
- [ ] `apps/server/src/routes/chat/index.ts`
- [ ] `apps/server/src/routes/chat/ava-tools.ts`

### Verification
- [ ] AvaConfig type has optional mcpServers field
- [ ] DEFAULT_AVA_CONFIG initializes mcpServers as empty array
- [ ] ava-config.json can include mcpServers without breaking schema
- [ ] streamText in index.ts merges ava mcpServers with any project-level MCP servers
- [ ] execute_dynamic_agent passes ava mcpServers to DynamicAgentExecutor
- [ ] Existing behavior unchanged when mcpServers is empty/undefined

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
