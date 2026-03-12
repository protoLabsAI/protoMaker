# Phase 1: Add NotesWorkspace CRDT domain schema

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add NotesWorkspaceDocument to libs/crdt/src/documents.ts. Schema mirrors the existing disk format: { schemaVersion, _meta, tabs: Record<tabId, NoteTab>, tabOrder: string[], activeTabId: string | null }. NoteTab fields: id, name, content (string — HTML from TipTap), permissions (agentRead, agentWrite), createdAt, updatedAt, wordCount, characterCount. Add normalizer that handles missing fields for schema-on-read migration. Add 'notes' to the DomainName union in libs/crdt/src/types.ts. Wire into crdt-store.module.ts: inject CRDTStore into a new NotesService, initialize the notes domain document with id='workspace', implement hydration function that reads existing .automaker/notes/workspace.json and seeds the CRDT document on first start.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/src/documents.ts`
- [ ] `libs/crdt/src/types.ts`
- [ ] `apps/server/src/services/crdt-store.module.ts`

### Verification
- [ ] NotesWorkspaceDocument interface defined in documents.ts with all NoteTab fields
- [ ] normalizeNotesWorkspace() normalizer handles missing tabs, tabOrder, activeTabId
- [ ] 'notes' added to DomainName union in types.ts
- [ ] crdt-store.module.ts injects CRDTStore into notes handling with domain='notes', id='workspace'
- [ ] Hydration function reads .automaker/notes/workspace.json and calls getOrCreate with initial data
- [ ] Hydration is idempotent (only runs if document does not exist in registry)
- [ ] npm run typecheck passes
- [ ] npm run test:packages passes

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
