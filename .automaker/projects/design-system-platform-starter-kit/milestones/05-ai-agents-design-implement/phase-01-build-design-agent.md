# Phase 1: Build Design Agent

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create an AI agent that makes design decisions: layout, spacing, typography, responsive breakpoints. Uses Pencil MCP tools (batch_design, set_variables, get_screenshot, snapshot_layout) to manipulate .pen files. Takes natural language design requests and translates them into .pen modifications. Includes system prompt with design principles (spacing scales, typography hierarchy, color theory basics).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/agents/src/design-agent.ts`
- [ ] `libs/templates/starters/design-system/packages/agents/src/prompts/design.md`
- [ ] `libs/templates/starters/design-system/packages/server/src/routes/agents.ts`

### Verification
- [ ] Agent modifies .pen files via Pencil MCP
- [ ] Natural language design requests work
- [ ] Layout and spacing decisions follow design principles
- [ ] Agent can create new components in .pen files
- [ ] Screenshot verification after modifications

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
