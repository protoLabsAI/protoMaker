# M1: Security Hardening

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix injection vulnerabilities that allow arbitrary command execution via user-supplied content

---

## Phases

| Phase | File                                                                                                                                                                   | Duration  | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ----- |
| 1     | [phase-01-fix-shell-injection-in-completiondetector-gh-pr-create.md](./phase-01-fix-shell-injection-in-completiondetector-gh-pr-create.md)                             | 0.5 weeks | None         | TBD   |
| 2     | [phase-02-fix-graphql-injection-in-coderabbitresolver-and-git-workflow-service.md](./phase-02-fix-graphql-injection-in-coderabbitresolver-and-git-workflow-service.md) | 1 week    | None         | TBD   |

---

## Success Criteria

M1 is **complete** when:

- [ ] All phases complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Team reviewed and approved

---

## Outputs

### For Next Milestone

- Foundation work ready for dependent features
- APIs stable and documented
- Types exported and usable

---

## Handoff to M2

Once M1 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-fix-shell-injection-in-completiondetector-gh-pr-create.md)
