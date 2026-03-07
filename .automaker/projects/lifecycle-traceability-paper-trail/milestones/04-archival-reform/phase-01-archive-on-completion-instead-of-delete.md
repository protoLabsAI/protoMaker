# Phase 1: Archive-on-completion instead of delete

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update ArchivalService to move feature directories to .automaker/archive/{featureId}/ instead of deleting them. Preserve: feature.json (full statusHistory, executionHistory, remediationHistory), agent-output.md, handoff-*.json. Delete: backups/ directory (operational only), raw-output.jsonl (debug only, opt-in preserve via setting). Add archivalPolicy to WorkflowSettings: { retentionDays: number (default: 90), preserveAgentOutput: boolean (default: true), preserveHandoffs: boolean (default: true) }. After moving, create a minimal stub at the original location with { archived: true, archivedAt: ISO, archivePath: string } so FeatureLoader knows the feature was archived.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/archival-service.ts`
- [ ] `libs/types/src/project-settings.ts`
- [ ] `apps/server/src/services/feature-loader.ts`

### Verification
- [ ] Completed features are moved to .automaker/archive/{featureId}/ not deleted
- [ ] feature.json preserved with full statusHistory and executionHistory
- [ ] agent-output.md preserved in archive
- [ ] handoff-*.json preserved in archive
- [ ] Stub feature.json left at original path with archived: true
- [ ] FeatureLoader.get() returns archived indicator for archived features
- [ ] archivalPolicy added to WorkflowSettings with defaults
- [ ] M1 archival tests updated to verify new behavior
- [ ] npm run typecheck passes

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
