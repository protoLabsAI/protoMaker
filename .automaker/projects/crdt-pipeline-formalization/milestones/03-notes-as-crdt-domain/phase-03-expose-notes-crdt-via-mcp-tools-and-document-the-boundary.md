# Phase 3: Expose notes CRDT via MCP tools and document the boundary

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Verify that the MCP tools for notes (list_note_tabs, read_note_tab, write_note_tab, create_note_tab, delete_note_tab) work correctly through the refactored notes routes. Update the MCP tool descriptions or server-side validation if needed to reflect CRDT-backed behavior. Add a comment block at the top of the notes route file documenting the storage model: primary=CRDT (Automerge, domain='notes', id='workspace'), fallback=disk (.automaker/notes/workspace.json). Update docs/dev/ with a notes-sync.md page documenting the notes CRDT domain, conflict semantics (LWW per tab), and the deferred TipTap binding.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/notes/index.ts`
- [ ] `docs/dev/notes-sync.md`

### Verification
- [ ] All 5 MCP note tools function correctly with CRDT-backed routes
- [ ] Storage model comment block added to notes route file
- [ ] docs/dev/notes-sync.md created documenting: domain name, id, conflict semantics, hydration, fallback behavior, deferred TipTap binding
- [ ] docs/dev/notes-sync.md is under 800 lines and added to appropriate sidebar section
- [ ] npm run typecheck passes

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
