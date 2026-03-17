# Phase 1: Fix deploy-staging.yml rebuild step

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Diagnose and fix the failing Rebuild and restart staging step. Check SSH keys, docker compose paths, build context. Add proper error output.

---

## Tasks

### Files to Create/Modify
- [ ] `.github/workflows/deploy-staging.yml`

### Verification
- [ ] deploy-staging.yml runs successfully end-to-end
- [ ] Staging containers rebuild and restart on push to staging
- [ ] Failed steps produce visible error output

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
