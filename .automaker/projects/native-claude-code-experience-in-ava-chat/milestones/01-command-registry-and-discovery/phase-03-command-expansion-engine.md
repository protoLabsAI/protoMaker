# Phase 3: Command Expansion Engine

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When a user message starts with /, the server loads the command body, expands placeholders ($ARGUMENTS, $1, $2), resolves @file references (reads file content inline), executes !backtick bash snippets (captures output inline), and injects the expanded text as a system context prefix for that turn. Respect allowed-tools from frontmatter to restrict the tool set.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/command-expansion-service.ts`
- [ ] `apps/server/src/routes/chat/index.ts`

### Verification
- [ ] $ARGUMENTS expands to full argument string after command name
- [ ] $1, $2 etc expand to positional arguments
- [ ] @file references replaced with file contents
- [ ] !backtick bash commands executed and output inlined
- [ ] allowed-tools from frontmatter restricts tool set for that turn
- [ ] Graceful fallback when file not found or command fails

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
