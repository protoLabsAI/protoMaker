# Phase 1: Wire ReactiveSpawnerService into Service Container

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Audit apps/server/src/server/services.ts: check if ReactiveSpawnerService is instantiated and if it is passed to AvaChannelReactorService. Audit ava-channel-reactor-service.ts: confirm dispatchResponse calls reactiveSpawnerService.spawnForMessage() for request-type messages. Audit reactive-spawner-service.ts: confirm it is initialized with DynamicAgentExecutor and the 'ava' template. Fix any missing wiring. If ReactiveSpawnerService is not instantiated in services.ts, add it. If it is not passed to the reactor, pass it. If the ava template is not registered in the role registry at startup, register it. Ensure the circuit breaker, hourly cap (3 sessions/hour), and error dedup set are active. Add a log line when dispatchResponse successfully spawns a session so it is observable.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/services/ava-channel-reactor-service.ts`
- [ ] `apps/server/src/services/reactive-spawner-service.ts`

### Verification

- [ ] ReactiveSpawnerService is instantiated in services.ts
- [ ] ReactiveSpawnerService is passed to AvaChannelReactorService
- [ ] dispatchResponse logs a message when it spawns a session for a request-type message
- [ ] Circuit breaker, hourly cap, and error dedup are confirmed active via log output or code inspection
- [ ] Build passes with no TypeScript errors
- [ ] Server unit test added or updated for ReactiveSpawnerService wiring

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
