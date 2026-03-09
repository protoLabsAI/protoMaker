# Phase 1: Pending Tool Approval Cards

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In the Ask Ava tab, render each entry in pendingSubagentApprovals as an inline card above the chat input. Each card shows: tool name, a truncated preview of toolInput (JSON, max 200 chars), an Approve button (calls approveSubagentTool), and a Deny button (calls denySubagentTool). Cards should be visually distinct (amber border or accent) so they are immediately noticeable. When no approvals are pending, render nothing. Multiple pending approvals stack vertically. Add a received timestamp ('Waiting Xs') that counts up from receivedAt.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx`

### Verification
- [ ] Pending tool approval cards render above the chat input when pendingSubagentApprovals is non-empty
- [ ] Each card shows tool name, input preview, approve button, deny button
- [ ] Approve calls approveSubagentTool(approvalId) and removes the card
- [ ] Deny calls denySubagentTool(approvalId) and removes the card
- [ ] Cards have an amber/warning visual treatment to draw attention
- [ ] Build passes with no TypeScript errors

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
