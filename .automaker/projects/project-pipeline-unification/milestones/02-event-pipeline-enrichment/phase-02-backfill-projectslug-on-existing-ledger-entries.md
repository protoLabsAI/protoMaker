# Phase 2: Backfill projectSlug on existing ledger entries

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Write a migration that reads the events.jsonl file, enriches entries missing projectSlug by looking up the feature's current projectSlug, and rewrites the file. This makes historical timeline data visible.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/ledger/routes/backfill.ts`
- [ ] `apps/server/src/server/routes.ts`

### Verification
- [ ] Ledger entries with featureId get projectSlug from current feature data
- [ ] Original entries are preserved (backup created)
- [ ] Idempotent
- [ ] Timeline shows historical activity after backfill

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
