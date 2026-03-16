# Phase 1: Context Metrics and Warning System

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend StreamObserverService with context/token usage tracking. Add ContextMetrics type to lead-engineer types. Track cumulative input/output tokens and estimated cost per agent execution. When context usage exceeds a configurable threshold (default 70%, stored in workflow settings as pipeline.contextWarningThreshold), inject a warning advisory into the agent's conversation prompting it to wrap up current work or decompose remaining tasks. Wire metrics into ExecuteProcessor's completion monitoring. Add context metrics to trajectory storage for analysis.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/stream-observer-service.ts`
- [ ] `libs/types/src/lead-engineer.ts`
- [ ] `apps/server/src/services/lead-engineer-execute-processor.ts`

### Verification

- [ ] ContextMetrics type added (inputTokens, outputTokens, estimatedCostUsd, contextUsagePercent)
- [ ] StreamObserverService tracks cumulative token counts per session
- [ ] Configurable warning threshold via pipeline.contextWarningThreshold (default 0.7)
- [ ] Warning injected as advisory text when threshold exceeded
- [ ] Warning text instructs agent to wrap up or decompose remaining work
- [ ] Context metrics included in trajectory storage
- [ ] Metric tracking does not block or slow agent execution
- [ ] npm run typecheck succeeds

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
