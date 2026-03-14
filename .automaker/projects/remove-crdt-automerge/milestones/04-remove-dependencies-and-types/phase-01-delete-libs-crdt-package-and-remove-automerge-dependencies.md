# Phase 1: Delete libs/crdt package and remove @automerge dependencies

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete the entire libs/crdt/ directory. Remove @protolabsai/crdt and all @automerge/* packages from package.json files. Delete the .automaker/crdt/ runtime directory.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/`
- [ ] `apps/server/package.json`
- [ ] `package.json`

### Verification
- [ ] libs/crdt/ directory deleted
- [ ] No @automerge/* in any package.json
- [ ] No @protolabsai/crdt in any package.json
- [ ] .automaker/crdt/ deleted
- [ ] npm install succeeds

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
