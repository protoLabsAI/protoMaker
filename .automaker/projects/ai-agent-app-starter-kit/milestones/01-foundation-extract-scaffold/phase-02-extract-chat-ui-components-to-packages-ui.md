# Phase 2: Extract chat UI components to packages/ui

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Copy 23 components from libs/ui/src/ai/ to the starter packages/ui/src/components/. Strip all 30 automaker-specific tool card registrations from tool-invocation-part.tsx. Replace @protolabsai/utils formatDuration import in chain-of-thought.tsx with inline function. Create lib/utils.ts with cn() helper. Create index.ts with all named exports. Ensure zero @protolabsai imports remain.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/templates/starters/ai-agent-app/packages/ui/src/components/chat-message.tsx`
- [ ] `libs/templates/starters/ai-agent-app/packages/ui/src/components/tool-invocation-part.tsx`
- [ ] `libs/templates/starters/ai-agent-app/packages/ui/src/components/chain-of-thought.tsx`
- [ ] `libs/templates/starters/ai-agent-app/packages/ui/src/index.ts`

### Verification

- [ ] 23 components extracted with zero @protolabsai imports
- [ ] tool-invocation-part.tsx has zero tool registrations
- [ ] chain-of-thought.tsx uses inline formatDuration
- [ ] All components compile

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
