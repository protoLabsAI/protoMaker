# Phase 2: Spec.md skeleton from research

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Generate a spec.md skeleton pre-filled with detected project information: name, description (from README or package.json), tech stack summary, architecture overview (monorepo packages or directory structure), key dependencies. Includes placeholder sections the user should fill in: product goals, target users, key workflows, constraints.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/repo-research-service.ts`
- [ ] `apps/server/src/routes/setup/routes/project.ts`

### Verification
- [ ] spec.md generated with detected project info
- [ ] Placeholder sections clearly marked for user to fill
- [ ] Architecture section reflects actual repo structure
- [ ] Does not overwrite existing spec.md

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
