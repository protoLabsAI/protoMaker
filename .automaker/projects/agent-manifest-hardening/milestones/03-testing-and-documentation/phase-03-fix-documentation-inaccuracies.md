# Phase 3: Fix documentation inaccuracies

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Fix three doc issues: (1) prompt injection section shows wrong order (should be role prompt then context+memory), (2) manifestPaths documented but not implemented, (3) description field listed as Required but defaults to empty string.

---

## Tasks

### Files to Create/Modify
- [ ] `docs/agents/agent-manifests.md`

### Verification
- [ ] Prompt injection section matches actual code behavior
- [ ] manifestPaths either documented as implemented or removed
- [ ] description field correctly shown as optional
- [ ] VitePress builds without errors

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
