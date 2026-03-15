# Phase 2: Build Implement Agent

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create an AI agent that converts .pen designs to production React code. Uses the pen-to-react pipeline from packages/codegen. Can generate individual components or entire component libraries. Understands the code generation output and can refine it based on feedback. Writes generated components to the output directory with proper file structure.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/agents/src/implement-agent.ts`
- [ ] `libs/templates/starters/design-system/packages/agents/src/prompts/implement.md`

### Verification
- [ ] Agent generates React from .pen via codegen pipeline
- [ ] Can generate single component or full library
- [ ] Writes files to correct output directory
- [ ] Generated code passes TypeScript compilation
- [ ] Agent can refine output based on feedback

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
