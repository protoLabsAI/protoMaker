# Phase 1: Retrieval Tools (grep, describe, expand)

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Three agent retrieval tools: lcm_grep (FTS5 search across messages and summaries), lcm_describe (summary metadata and lineage), lcm_expand (bounded sub-agent DAG walk). Expose all via MCP server.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/retrieval/grep.ts`
- [ ] `libs/context-engine/src/retrieval/describe.ts`
- [ ] `libs/context-engine/src/retrieval/expand.ts`
- [ ] `libs/context-engine/src/retrieval/index.ts`
- [ ] `apps/server/src/routes/context-engine.ts`
- [ ] `packages/mcp-server/plugins/automaker/src/tools/context-engine.ts`

### Verification
- [ ] lcm_grep returns relevant matches from full history
- [ ] lcm_describe shows summary content with provenance chain
- [ ] lcm_expand spawns bounded sub-agent for focused questions
- [ ] Sub-agent respects token cap and TTL
- [ ] All three exposed via MCP server
- [ ] Tools work within agent sessions

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
