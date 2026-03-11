# Phase 1: Command Registry Service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create CommandRegistryService that scans filesystem for commands: built-in commands (compact, clear, new), MCP plugin commands from packages/mcp-server/plugins/automaker/commands/*.md, learned skills from .automaker/skills/*.md, and project skills from .claude/skills/*.md. Parse YAML frontmatter (name, description, argument-hint, allowed-tools, model). Cache results with file-watch invalidation. Register as a service in the ServiceContainer.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/command-registry-service.ts`
- [ ] `apps/server/src/server/services.ts`

### Verification
- [ ] Service discovers commands from all 4 sources
- [ ] Frontmatter parsed correctly (name, description, argument-hint, allowed-tools)
- [ ] Built-in commands (compact, clear, new) registered without filesystem
- [ ] Cache invalidates when command files change
- [ ] Service registered in ServiceContainer

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
