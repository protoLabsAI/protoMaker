# Phase 1: Add fallback timeline from feature activity

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When the event ledger has no entries for a project, fall back to constructing timeline events from the project's features directly (creation dates, status changes from feature.json metadata). This ensures timelines work even before the ledger enrichment.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/projects/routes/timeline.ts`

### Verification
- [ ] Timeline shows activity for projects with features but no ledger entries
- [ ] Ledger-based entries take priority when available
- [ ] Empty projects still show 'No activity yet'

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
