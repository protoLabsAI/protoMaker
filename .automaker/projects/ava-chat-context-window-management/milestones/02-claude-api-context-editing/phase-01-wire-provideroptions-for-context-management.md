# Phase 1: Wire providerOptions for context management

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add providerOptions.anthropic to the streamText() call in the chat route. Enable context_management with clear_tool_uses_20250919 policy. Add the required beta header context-management-2025-06-27. Test that Claude automatically clears old tool use/result pairs when context is tight.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/chat/index.ts`

### Verification
- [ ] providerOptions.anthropic.context_management is set in streamText call
- [ ] Beta header is included in API requests
- [ ] Claude clears old tool results automatically when context is tight
- [ ] No regression in normal chat flow
- [ ] TypeScript compiles cleanly

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
