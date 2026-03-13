# Phase 1: Enhanced Timeline — ceremony entries with artifact links

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update apps/ui/src/components/views/projects/project-timeline.tsx and the timeline route transformer (apps/server/src/routes/projects/routes/timeline.ts) to: (1) include ceremony:fired events with a link to the associated ceremony-report artifact when one exists; (2) add 'decision' and 'escalation' entry types to the filter bar; (3) show the ceremony type label (Standup, Milestone Retro, Project Retro) on ceremony timeline cards. Update timeline-utils.ts event type icon/color mapping for the new entry types.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects/project-timeline.tsx`
- [ ] `apps/ui/src/components/views/projects/timeline-utils.ts`
- [ ] `apps/server/src/routes/projects/routes/timeline.ts`

### Verification
- [ ] Ceremony events in timeline show ceremony type label
- [ ] Ceremony events link to their artifact when one exists
- [ ] Filter bar includes Decision and Escalation categories
- [ ] Icon and color correct for each event type
- [ ] Existing timeline behavior unchanged for non-ceremony events

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
