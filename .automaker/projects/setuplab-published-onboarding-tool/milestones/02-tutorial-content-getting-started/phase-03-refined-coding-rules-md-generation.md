# Phase 3: Refined coding-rules.md generation

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Improve the existing coding-rules.md template to be more useful out of the box. Include detected linting config (ESLint rules, Prettier config), import conventions (from tsconfig paths), testing patterns (framework, test file location, run command), and formatting requirements. Make it immediately useful as agent context.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/setup/routes/project.ts`

### Verification
- [ ] coding-rules.md includes detected lint/format config
- [ ] Import conventions derived from tsconfig paths
- [ ] Testing section includes framework and run commands
- [ ] File is immediately useful as agent context without editing
- [ ] Does not overwrite existing coding-rules.md

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
