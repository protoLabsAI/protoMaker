# Phase 1: ProtoConfig types and YAML schema

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Define ProtoConfig TypeScript types in libs/types/src/proto-config.ts covering: name, version, techStack (language, framework, packageManager, testRunner, bundler), commands (build, test, lint, dev, format), git (baseBranch, strategy, prBaseBranch), protolab section (enabled, syncPort, instanceId), and defaults section. Export from libs/types/src/index.ts. Create a JSON Schema or Zod validator for the YAML structure.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/proto-config.ts`
- [ ] `libs/types/src/index.ts`

### Verification
- [ ] ProtoConfig type exported from @protolabsai/types
- [ ] Zod schema validates proto.config.yaml structure
- [ ] Schema supports all fields: name, techStack, commands, git, protolab, defaults
- [ ] Optional fields have sensible defaults
- [ ] Type is forward-compatible with CRDT sync project requirements

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
