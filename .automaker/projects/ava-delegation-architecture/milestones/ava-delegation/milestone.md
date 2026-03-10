# Ava Delegation + Slim Down

*Part of: Ava Delegation Architecture*

Add delegate_to_pm tool to Ava. Reorganize Ava's default tool groups to the slim operator surface.

**Status:** undefined
**Dependencies:** expand-pm-tools, ceremony-engine

## Phases

### 1. delegate_to_pm tool implementation

Add delegate_to_pm tool to ava-tools.ts. Takes projectSlug + question. Creates a one-shot PM chat completion using PM's full tool surface and project context. Direct function call to PM chat handler (not backchannel). Returns PM's text response to Ava. Include timeout (60s) and error handling.

**Complexity:** large

**Files:**
- apps/server/src/routes/chat/ava-tools.ts
- apps/server/src/routes/project-pm/pm-agent.ts

**Acceptance Criteria:**
- [ ] delegate_to_pm tool registered in ava-tools
- [ ] Tool calls PM with full context and tools
- [ ] PM response returned to Ava within timeout
- [ ] Errors handled gracefully
- [ ] Build passes

### 2. Slim Ava default tool groups

Reorganize ava-config.ts DEFAULT_AVA_CONFIG to disable project-tactical tool groups by default. Keep enabled: briefing, health, notes, calendar, discord, avaChannel, metrics, settings, delegation, boardRead. Disable by default: boardWrite, agentControl, autoMode, prWorkflow, promotion, contextFiles, orchestration. Add new 'delegation' tool group containing delegate_to_pm. Users can re-enable any group via ava-config.json.

**Complexity:** medium

**Files:**
- apps/server/src/routes/chat/ava-config.ts
- apps/server/src/routes/chat/ava-tools.ts

**Acceptance Criteria:**
- [ ] Default Ava config has ~20 tools enabled
- [ ] Disabled groups still available via config toggle
- [ ] delegation tool group added with delegate_to_pm
- [ ] boardRead stays enabled for overview
- [ ] No tools removed, just default-off
- [ ] Build passes

### 3. Ava system prompt update

Update ava-prompt.md to reflect delegation model. Ava should: use delegate_to_pm for project-specific questions, provide strategic overview and cross-project coordination, audit and create game plans, know when to delegate vs handle directly. Include examples of delegation patterns.

**Complexity:** small

**Files:**
- apps/server/src/routes/chat/ava-prompt.md

**Acceptance Criteria:**
- [ ] Prompt instructs Ava to delegate project-specific work
- [ ] Clear examples of when to delegate vs handle directly
- [ ] Prompt size stays reasonable (<2k tokens)
- [ ] Ava correctly delegates in manual testing
