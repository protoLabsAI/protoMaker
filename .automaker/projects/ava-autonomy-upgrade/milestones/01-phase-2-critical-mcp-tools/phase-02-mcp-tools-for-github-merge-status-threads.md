# Phase 2: MCP tools for GitHub merge/status/threads

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 3 MCP tools: merge_pr (calls /api/github/merge-pr), check_pr_status (calls /api/github/check-pr-status), resolve_review_threads (calls existing /api/github/process-coderabbit-feedback). In packages/mcp-server/src/index.ts, add tool definitions in tools section and handlers in handleTool switch. Follow pattern from existing MCP tools using apiCall() helper.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/src/index.ts`

### Verification
- [ ] merge_pr tool merges PR and returns result
- [ ] check_pr_status tool returns CI check states
- [ ] resolve_review_threads tool resolves CodeRabbit threads
- [ ] All 3 tools appear in claude mcp test automaker output

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
