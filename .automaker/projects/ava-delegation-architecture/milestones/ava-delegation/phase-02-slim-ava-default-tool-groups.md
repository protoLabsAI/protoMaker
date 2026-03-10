# Phase 2: Slim Ava default tool groups

*Ava Delegation Architecture > Ava Delegation + Slim Down*

Reorganize ava-config.ts DEFAULT_AVA_CONFIG to disable project-tactical tool groups by default. Keep enabled: briefing, health, notes, calendar, discord, avaChannel, metrics, settings, delegation, boardRead. Disable by default: boardWrite, agentControl, autoMode, prWorkflow, promotion, contextFiles, orchestration. Add new 'delegation' tool group containing delegate_to_pm. Users can re-enable any group via ava-config.json.

**Complexity:** medium

## Files to Modify

- apps/server/src/routes/chat/ava-config.ts
- apps/server/src/routes/chat/ava-tools.ts

## Acceptance Criteria

- [ ] Default Ava config has ~20 tools enabled
- [ ] Disabled groups still available via config toggle
- [ ] delegation tool group added with delegate_to_pm
- [ ] boardRead stays enabled for overview
- [ ] No tools removed, just default-off
- [ ] Build passes