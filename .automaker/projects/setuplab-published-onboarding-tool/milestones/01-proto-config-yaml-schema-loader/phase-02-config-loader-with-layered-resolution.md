# Phase 2: Config loader with layered resolution

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create loadProtoConfig() in libs/platform/src/proto-config.ts. Reads proto.config.yaml from project root, merges with .automaker/settings.json overrides, then env var overrides. Returns null if no proto.config.yaml exists (single-instance mode). Includes writeProtoConfig() for setuplab to generate the initial file.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/platform/src/proto-config.ts`
- [ ] `libs/platform/src/index.ts`

### Verification
- [ ] loadProtoConfig(projectPath) reads and parses YAML
- [ ] Layered merge: YAML -> settings.json -> env vars
- [ ] Returns null when no proto.config.yaml exists
- [ ] writeProtoConfig(projectPath, config) writes formatted YAML
- [ ] Unit tests for merge logic and missing file handling
- [ ] Build passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
