# Phase 2: Create GTM specialist role and capabilities

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add 'gtm-specialist' to AgentRole type. Define ROLE_CAPABILITIES with tools (Read, Grep, Glob, WebSearch, WebFetch, Write, Edit), model (sonnet), maxTurns (250). Add HeadsdownConfig defaults. No Bash, no commit, no PR creation.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/agent-roles.ts`
- [ ] `libs/types/src/headsdown.ts`

### Verification
- [ ] gtm-specialist in AgentRole union type
- [ ] ROLE_CAPABILITIES has gtm-specialist entry
- [ ] DEFAULT_HEADSDOWN_CONFIGS has gtm-specialist entry
- [ ] Types build cleanly

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
