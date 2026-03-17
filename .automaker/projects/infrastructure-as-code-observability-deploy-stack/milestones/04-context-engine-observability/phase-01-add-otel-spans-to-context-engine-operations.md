# Phase 1: Add OTel spans to context engine operations

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Instrument context engine with OpenTelemetry spans for LeafCompactor.compact(), Condensation.condense(), ContextAssembler.assemble(), and ConversationStore operations. Use OTel tracer API so spans flow through existing NodeSDK to Langfuse. Add featureId as span attribute.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/compaction/leaf-compactor.ts`
- [ ] `libs/context-engine/src/compaction/condensation.ts`
- [ ] `libs/context-engine/src/assembly/assembler.ts`

### Verification
- [ ] Compaction operations create spans in Langfuse
- [ ] Assembly spans include budget and message count attributes
- [ ] Spans correlated via featureId attribute
- [ ] npm run build:packages passes

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
