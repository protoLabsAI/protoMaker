# Phase 2: Build complete content creation flow

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wire all subgraphs and nodes into the complete ContentCreationFlow StateGraph. The flow follows: Research(parallel) → HITL → Outline → HITL → Generation(parallel) → Assembly → Review(parallel) → HITL → Output(parallel). Create createContentCreationFlow() factory function that accepts config options. Compile with MemorySaver for HITL resume support. Export from @automaker/flows.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/flows/src/content/content-creation-flow.ts`
- [ ] `libs/flows/src/content/index.ts`
- [ ] `libs/flows/src/index.ts`

### Verification
- [ ] Complete flow compiles without errors
- [ ] 7 phases wired correctly with proper edge routing
- [ ] 3 HITL interrupts at research, outline, and final review
- [ ] Send() used for research, generation, review, and output phases
- [ ] MemorySaver checkpointer enables resume after interrupts
- [ ] Factory function accepts ContentConfig for customization
- [ ] Exported from @automaker/flows package
- [ ] Works end-to-end with FakeChatModel

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
