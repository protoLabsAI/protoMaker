# Phase 3: Timeline UI in project detail

*Ava Delegation Architecture > Ceremony Engine + Paper Trail*

Enhance existing ProjectTimeline component to render new structured timeline entries. Different card styles for standups (green), retros (blue), decisions (amber), escalations (red), milestone completions (purple). Each card shows author, timestamp, expandable content. Filter by entry type. Auto-refresh via React Query.

**Complexity:** medium

## Files to Modify

- apps/ui/src/components/views/projects/project-timeline.tsx
- apps/ui/src/components/views/projects-view/project-detail.tsx

## Acceptance Criteria

- [ ] Timeline renders all entry types with distinct visual styles
- [ ] Entries filterable by type
- [ ] Auto-refreshes on new entries
- [ ] Looks good on mobile
- [ ] Build passes