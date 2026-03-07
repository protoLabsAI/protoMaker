# Phase 1: proto.config Loader

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create proto.config.yaml schema and loader in libs/platform. Implements layered config resolution: proto.config.yaml (git-tracked shared defaults) -> .automaker/settings.json (instance-local overrides) -> environment variables. Defines hive identity, instance registry, sync port, assignment strategy, and shared defaults. Loader returns effective config for the current instance.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/platform/src/proto-config.ts`
- [ ] `libs/types/src/proto-config.ts`
- [ ] `libs/types/src/index.ts`

### Verification
- [ ] ProtoConfig TypeScript types defined with hive, defaults, instances, and assignment sections
- [ ] loadProtoConfig() reads YAML, merges with instance-local settings and env vars
- [ ] Missing proto.config.yaml returns null (single-instance mode continues to work)
- [ ] Instance identity resolved from hostname or explicit config
- [ ] Unit tests for layered merge logic

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
