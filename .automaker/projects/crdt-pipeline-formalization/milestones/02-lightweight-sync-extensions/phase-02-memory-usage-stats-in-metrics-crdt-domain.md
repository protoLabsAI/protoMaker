# Phase 2: Memory usage stats in Metrics CRDT domain

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend MetricsDocument in libs/crdt/src/documents.ts to add a memoryStats field: Record<instanceId, Record<filename, { loaded: number, referenced: number, successfulFeatures: number }>>. Update memory-loader.ts (libs/utils/src/memory-loader.ts) to write usage stat increments to the CRDT Metrics document via a callback/injected function instead of (or in addition to) writing to disk YAML frontmatter. Each instance writes to its own instanceId key. Read path: aggregate across all instance keys at load time to get total usage counts for memory file scoring. The YAML frontmatter on disk can be deprecated — it remains for backwards compat but is no longer the source of truth for scoring when CRDT is available.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/src/documents.ts`
- [ ] `libs/utils/src/memory-loader.ts`
- [ ] `apps/server/src/services/crdt-store.module.ts`

### Verification
- [ ] MetricsDocument has memoryStats: Record<instanceId, Record<filename, MemoryUsageStat>> field
- [ ] Normalizer for MetricsDocument handles missing memoryStats field (schema-on-read)
- [ ] memory-loader.ts accepts an optional CRDTStore reference (or callback) for writing stats
- [ ] When CRDT is available, stat increments write to CRDT Metrics doc under local instanceId key
- [ ] Memory file scoring reads aggregated stats across all instanceId keys when CRDT is available
- [ ] Disk YAML frontmatter still updated for backwards compat (graceful degradation)
- [ ] npm run typecheck passes
- [ ] npm run test:packages passes

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
