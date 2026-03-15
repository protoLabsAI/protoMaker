# Phase 1: Build MCP server for design system

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create packages/mcp/ exposing design system capabilities as MCP tools. Tool categories: Design (read/write .pen files), Tokens (CRUD, export CSS/Tailwind), Components (generate React/HTML, list components), A11y (audit component, check contrast), Color (generate palette, check contrast). Uses the tools package pattern from ai-agent-app (defineSharedTool + toMCPTool adapter).

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/design-system/packages/mcp/src/index.ts`
- [ ] `libs/templates/starters/design-system/packages/mcp/src/tools/design-tools.ts`
- [ ] `libs/templates/starters/design-system/packages/mcp/src/tools/token-tools.ts`
- [ ] `libs/templates/starters/design-system/packages/mcp/src/tools/component-tools.ts`
- [ ] `libs/templates/starters/design-system/packages/mcp/src/tools/a11y-tools.ts`

### Verification

- [ ] MCP server starts and lists all tools
- [ ] Design tools read/write .pen files
- [ ] Token tools export to CSS/Tailwind
- [ ] Component tools trigger code generation
- [ ] A11y tools run audits and return results

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
