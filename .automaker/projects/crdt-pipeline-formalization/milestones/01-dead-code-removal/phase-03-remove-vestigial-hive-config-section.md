# Phase 3: Remove vestigial hive: config section

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove the hive: section from proto.config.yaml (hiveId, syncPort=9800, meshEnabled fields) — this section is not read by any server runtime code; the actual hivemind config is under hivemind:. Before removing, update loadProtoConfig() in libs/platform/src/proto-config.ts to remove the hive.instanceId fallback path for instance ID resolution, replacing it with a direct hivemind.instanceId or protolab.instanceId lookup. Remove ProtoConfigHive interface and the hive?: ProtoConfigHive field from the ProtoConfig type. Update any tests that reference the hive config.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/platform/src/proto-config.ts`
- [ ] `proto.config.yaml`
- [ ] `libs/types/src/proto-config.ts`

### Verification
- [ ] ProtoConfigHive interface removed from libs/types/src/proto-config.ts
- [ ] hive?: field removed from ProtoConfig interface
- [ ] loadProtoConfig() no longer reads config.hive for any fallback logic
- [ ] Instance ID resolution in loadProtoConfig() still works (uses protolab.instanceId or hivemind config)
- [ ] proto.config.yaml hive: section removed
- [ ] npm run typecheck passes
- [ ] npm run test:packages passes
- [ ] Server starts without error (no references to removed hive fields)

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
