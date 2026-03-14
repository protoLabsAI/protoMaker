# Phase 3: Remove or implement manifestPaths setting

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

The manifestPaths field in AgentConfig is declared but never consumed by AgentManifestService. Either implement support for additional manifest directories or remove the field to avoid dead configuration.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/workflow-settings.ts`
- [ ] `docs/agents/agent-manifests.md`

### Verification
- [ ] No dead configuration fields
- [ ] If implemented: additional paths are searched for manifests
- [ ] If removed: docs updated to reflect removal

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
