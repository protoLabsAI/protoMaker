# Phase 1: Regenerate Button and Branch Navigator

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a regenerate icon button below each assistant message in the Ask Ava tab. When multiple variants exist (branchMap has >1 entry for a message), show prev/next arrows and a '1 of N' counter. Wire the regenerate button to the existing onRegenerate handler in chat-overlay-content.tsx. Wire prev/next to update currentBranchIndex. The branchInfoMap computed state already provides { branchIndex, branchCount, origId } — use it to drive the UI. Add a subtle 'Regenerating...' shimmer state while pendingBranchFor is set for this message.

---

## Tasks

### Files to Create/Modify
- [x] `apps/ui/src/components/views/chat-overlay/ask-ava-tab.tsx`
- [x] `apps/ui/src/components/views/chat-overlay/chat-overlay-content.tsx`

### Verification
- [x] Regenerate button appears below the last assistant message
- [x] Clicking regenerate calls onRegenerate and shows a loading state
- [x] When branchCount > 1, prev/next arrows and '1 of N' counter appear
- [x] Navigating branches updates the displayed message
- [x] Build passes with no TypeScript errors

---

## Deliverables

- [x] Code implemented and working
- [x] Tests passing
- [x] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [x] All tasks complete
- [x] Tests passing
- [x] Code reviewed
- [x] PR merged to main — [PR#2061](https://github.com/protoLabsAI/protoMaker/pull/2061)
- [x] Team notified

**Next**: Phase 2
