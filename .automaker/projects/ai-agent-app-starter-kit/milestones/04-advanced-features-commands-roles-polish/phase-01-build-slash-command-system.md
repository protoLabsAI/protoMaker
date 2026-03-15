# Phase 1: Build slash command system

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/server/src/commands/registry.ts with SlashCommand interface. Create example /summarize command. Wire into chat route — detect /command prefix, call expand(), prepend to system prompt. Create GET /api/commands endpoint. Integrate SlashCommandDropdown in chat input.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/commands/registry.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/commands/example.ts`
- [ ] `libs/templates/starters/ai-agent-app/packages/server/src/routes/commands.ts`

### Verification
- [ ] SlashCommand interface with expand function
- [ ] GET /api/commands returns registered commands
- [ ] /summarize expands into system prompt modification
- [ ] SlashCommandDropdown shows on / keystroke

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
