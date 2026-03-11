# Phase 2: Slash Command Dropdown Component

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create SlashCommandDropdown component rendered above the ChatInput when useSlashCommands.isActive is true. Shows filtered command list with name, description, source badge, and argument hint. Keyboard navigation (up/down/enter/escape). Selecting a command inserts the command name into the input. Positioned using the textarea caret position or anchored to the input bottom.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/ui/src/ai/slash-command-dropdown.tsx`
- [ ] `libs/ui/src/ai/index.ts`

### Verification
- [ ] Dropdown appears when typing / in ChatInput
- [ ] Shows filtered commands with name, description, source badge
- [ ] Keyboard navigation: arrow keys, enter to select, escape to close
- [ ] Selecting inserts /command-name into input
- [ ] Positioned above ChatInput, does not overflow viewport
- [ ] Accessible: proper ARIA roles and keyboard handling

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
