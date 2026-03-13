# Phase 3: PM Agent reads research before PRD generation

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update PM Agent's PRD generation step to check if research.md exists at getResearchMdPath(). If it does, read the file content and include it as additional context in the SPARC PRD generation prompt under a 'Research Findings' section. If research.md does not exist, proceed as before with no change to existing behavior.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-agents/pm-agent.ts`

### Verification
- [ ] PM Agent reads research.md when it exists before calling PRD generation
- [ ] Research findings are included in the PRD generation prompt context
- [ ] PM Agent behavior is unchanged when research.md does not exist
- [ ] No new dependencies introduced

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
