# Phase 3: Upgrade @automerge packages to latest 3.x

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Upgrade all four @automerge packages in libs/crdt/package.json to latest 3.x versions: @automerge/automerge, @automerge/automerge-repo, @automerge/automerge-repo-network-websocket, @automerge/automerge-repo-storage-nodefs. Check Automerge 3.x CHANGELOG for breaking changes (the Text class rename from v3.0 may affect our code — check for any RawString or Text usage). Verify the file format is backwards compatible with existing .automaker/crdt/ checkpoint files. Run full test suite. Also add @automerge/prosemirror to apps/ui/package.json as a forward-looking dependency for the future TipTap binding project (installed but not wired yet).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/package.json`
- [ ] `apps/ui/package.json`

### Verification
- [ ] All @automerge/* packages upgraded to latest 3.x in libs/crdt/package.json
- [ ] @automerge/prosemirror added to apps/ui/package.json
- [ ] No RawString or legacy Text class usage in libs/crdt/src/ after upgrade
- [ ] npm run build:packages passes
- [ ] npm run test:packages passes
- [ ] npm run test:server passes
- [ ] npm run typecheck passes
- [ ] Server starts and loads existing CRDT checkpoint files without error

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
