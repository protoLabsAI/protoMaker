# Phase 3: Ava system prompt update

*Ava Delegation Architecture > Ava Delegation + Slim Down*

Update ava-prompt.md to reflect delegation model. Ava should: use delegate_to_pm for project-specific questions, provide strategic overview and cross-project coordination, audit and create game plans, know when to delegate vs handle directly. Include examples of delegation patterns.

**Complexity:** small

## Files to Modify

- apps/server/src/routes/chat/ava-prompt.md

## Acceptance Criteria

- [ ] Prompt instructs Ava to delegate project-specific work
- [ ] Clear examples of when to delegate vs handle directly
- [ ] Prompt size stays reasonable (<2k tokens)
- [ ] Ava correctly delegates in manual testing