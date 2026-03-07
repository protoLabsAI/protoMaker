# Phase 3: Wire config generation into setup_lab

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update the setup_lab MCP tool and repo-research-service to generate proto.config.yaml from research results. Map detected tech stack, package.json scripts, and git config into the ProtoConfig schema. Write the file during initialization phase.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/repo-research-service.ts`
- [ ] `apps/server/src/routes/setup/routes/project.ts`
- [ ] `packages/mcp-server/src/tools/setup-tools.ts`

### Verification
- [ ] setup_lab generates proto.config.yaml at project root
- [ ] Config populated from repo research: name from package.json, techStack from detection, commands from scripts
- [ ] Git section populated from detected branch strategy
- [ ] Existing setup_lab flow not broken
- [ ] Proto.config.yaml is valid per Zod schema

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
