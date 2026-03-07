# Phase 1: Notes Rich-Text CRDT

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace workspace-level notes sync (HTML string LWW) with character-level collaborative editing via @automerge/prosemirror. Tiptap's ProseMirror layer wires to Automerge document for real-time co-editing. Multiple users on different instances can edit the same note tab simultaneously with conflict-free character merging.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/notes-view/notes-editor.tsx`
- [ ] `libs/crdt/src/documents.ts`
- [ ] `apps/server/src/routes/notes/index.ts`
- [ ] `package.json`

### Verification
- [ ] @automerge/prosemirror integrated with Tiptap editor
- [ ] Two users editing same note tab see each other's changes in real-time
- [ ] Concurrent edits merge without conflicts
- [ ] Cursor/selection awareness across instances (stretch goal)
- [ ] Backward compatible: single-instance mode still works without CRDT

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
