# Phase 2: Dynamic Agent Executor

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create DynamicAgentExecutor in apps/server/src/services/dynamic-agent-executor.ts. Takes a factory-configured agent config and executes it using the existing simpleQuery or Claude Agent SDK. Resolves model string via @automaker/model-resolver. Applies tool restrictions from template. Builds system prompt from template's systemPromptTemplate field. Integrates with existing AgentService execution patterns for monitoring and output capture.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/dynamic-agent-executor.ts`

### Verification
- [ ] Executes agent with correct model and system prompt
- [ ] Tool restrictions enforced (only allowed tools available)
- [ ] Output captured and accessible via existing patterns
- [ ] Error handling with classified errors
- [ ] Integration test: create from template + execute returns result

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
