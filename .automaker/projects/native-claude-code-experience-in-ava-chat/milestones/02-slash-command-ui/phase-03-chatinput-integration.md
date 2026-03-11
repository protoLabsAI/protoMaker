# Phase 3: ChatInput Integration

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Wire the SlashCommandDropdown into ChatInput. Pass the current input value to useSlashCommands, render the dropdown when active, handle selection by updating the prompt input value. On submit, if text starts with /, send it through normally — the server handles expansion. Add visual indicator (different input border color or icon) when in command mode.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/ui/src/ai/chat-input.tsx`
- [ ] `apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx`

### Verification
- [ ] Typing / in ChatInput shows command dropdown
- [ ] Tab/Enter selects command and inserts into input
- [ ] User can continue typing arguments after command name
- [ ] Submit sends /command text to server as normal message
- [ ] Visual indicator shows command mode is active
- [ ] No regression: normal text input works unchanged

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
