# Phase 1: Context Engine Types & Package Scaffold

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create libs/context-engine/ package with TypeScript types for the DAG model: Message, Summary, SummaryNode, ContextItem, CompactionConfig, AssemblyResult. Define the ContextEngine interface. Set up package.json, tsconfig, exports. Add to workspace.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/context-engine/package.json`
- [ ] `libs/context-engine/tsconfig.json`
- [ ] `libs/context-engine/src/index.ts`
- [ ] `libs/context-engine/src/types.ts`
- [ ] `libs/context-engine/src/engine.ts`
- [ ] `package.json`

### Verification

- [ ] Package builds with npm run build:packages
- [ ] Types exported and importable from @protolabsai/context-engine
- [ ] ContextEngine interface defined with ingest, compact, assemble, retrieve methods
- [ ] CompactionConfig covers all knobs: freshTailCount, contextThreshold, leafMinFanout, condensedMinFanout, incrementalMaxDepth

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
