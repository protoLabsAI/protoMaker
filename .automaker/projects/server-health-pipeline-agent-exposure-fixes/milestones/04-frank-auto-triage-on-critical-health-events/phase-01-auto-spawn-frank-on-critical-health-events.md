# Phase 1: Auto-spawn Frank on critical health events

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add an event subscriber in index.ts that, on health:check-completed with status === 'critical', spawns Frank via DynamicAgentExecutor with a diagnostic prompt.

Frank's template (devops-engineer) is already in the role registry. Use execute_dynamic_agent pattern:
1. apps/server/src/index.ts — Add event listener for health:check-completed. When status is 'critical', check cooldown (don't spawn more than once per 10 minutes), then call agentFactoryService to create and run a Frank agent with prompt: 'Server health is critical: {issue details}. Read server logs with get_server_logs, check system health, diagnose the root cause, and post findings to Discord #infra.'
2. The agent should have access to: get_server_logs, get_detailed_health, health_check MCP tools, plus Discord send.

This is the simplest approach — no HeadsdownService changes needed. Direct event → agent spawn.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] Critical health events spawn Frank agent for triage
- [ ] Cooldown prevents spawning more than once per 10 minutes
- [ ] Frank reads server logs and posts diagnosis to Discord #infra
- [ ] Non-critical events don't spawn Frank
- [ ] npm run build:server passes

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
