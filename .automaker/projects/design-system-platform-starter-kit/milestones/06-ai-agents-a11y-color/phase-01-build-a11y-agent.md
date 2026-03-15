# Phase 1: Build A11y Agent

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create an AI agent that audits components for accessibility. Wraps axe-core for automated WCAG checking. AI analysis layer on top for semantic a11y issues that axe-core misses (context-dependent alt text, logical tab order, meaningful link text). Generates remediation suggestions with code examples. Can audit individual components or full pages.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/templates/starters/design-system/packages/agents/src/a11y-agent.ts`
- [ ] `libs/templates/starters/design-system/packages/agents/src/prompts/a11y.md`
- [ ] `libs/templates/starters/design-system/packages/a11y/src/audit.ts`
- [ ] `libs/templates/starters/design-system/packages/a11y/src/axe-wrapper.ts`

### Verification
- [ ] axe-core audit runs on rendered components
- [ ] AI analysis identifies semantic a11y issues
- [ ] Remediation suggestions include code examples
- [ ] WCAG AA/AAA compliance reported
- [ ] Can audit single component or full page

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
