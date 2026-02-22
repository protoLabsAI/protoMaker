# Agile Ceremony System

protoLabs's Ceremony Service automates agile ceremonies — standups, milestone retros, project retros, and board grooming — posting structured updates to Discord as projects progress through their lifecycle.

## Ceremony Types

| Ceremony              | Trigger Event         | What It Posts                                                             | Setting                  |
| --------------------- | --------------------- | ------------------------------------------------------------------------- | ------------------------ |
| **Milestone Standup** | `milestone:started`   | Planned phases, complexity breakdown, progress                            | `enableStandups`         |
| **Milestone Retro**   | `milestone:completed` | Features shipped, PRs, cost, duration, blockers, next steps               | `enableMilestoneUpdates` |
| **Project Retro**     | `project:completed`   | LLM-generated retrospective (what went well/wrong, lessons, action items) | `enableProjectRetros`    |
| **Board Groom**       | _(planned)_           | Stale features, blockers, queue health, recommended actions               | _(not yet implemented)_  |
| **Doc Generation**    | _(planned)_           | Auto-generate/update docs when features complete                          | _(not yet implemented)_  |

## Configuration

Ceremonies are configured per-project in `.automaker/settings.json`:

```json
{
  "ceremonySettings": {
    "enabled": true,
    "discordChannelId": "<channel-id>",
    "enableStandups": true,
    "enableMilestoneUpdates": true,
    "enableProjectRetros": true,
    "retroModel": {
      "model": "sonnet"
    }
  }
}
```

**Settings reference:**

| Field                    | Type    | Default               | Description                           |
| ------------------------ | ------- | --------------------- | ------------------------------------- |
| `enabled`                | boolean | `false`               | Master toggle for all ceremonies      |
| `discordChannelId`       | string  | —                     | Discord channel ID for ceremony posts |
| `enableStandups`         | boolean | `true`                | Post standup when milestone starts    |
| `enableMilestoneUpdates` | boolean | `true`                | Post retro when milestone completes   |
| `enableProjectRetros`    | boolean | `true`                | Post LLM retro when project completes |
| `retroModel`             | object  | `{ model: 'sonnet' }` | Model config for LLM-generated retros |

**Type definition:** `libs/types/src/settings.ts` → `CeremonySettings`

## Event Flow

```
ProjM Agent (projm-agent.ts)
  │
  ├─ milestone starts ──→ emit('milestone:started', payload)
  │                              │
  │                              ▼
  │                    CeremonyService.handleMilestoneStarted()
  │                              │
  │                              ▼
  │                    generateMilestoneStandup()
  │                              │
  │                              ▼
  │                    Discord: #dev channel
  │
  ├─ milestone done ───→ emit('milestone:completed', payload)
  │                              │
  │                              ▼
  │                    CeremonyService.handleMilestoneCompleted()
  │                              │
  │                              ▼
  │                    generateMilestoneCeremony()
  │                              │
  │                              ▼
  │                    Discord: #dev channel
  │
  └─ project done ────→ emit('project:completed', payload)
                                 │
                                 ▼
                       CeremonyService.handleProjectCompleted()
                                 │
                                 ▼
                       LLM generates retrospective (simpleQuery)
                                 │
                                 ▼
                       Discord: #dev channel
```

## Ceremony Content Examples

### Milestone Standup

Posted when a milestone starts work:

```
🚀 Agent Architect — Milestone 2/5 Starting
### Standup: Agent Factory & Execution

Planned Phases: 2
- Agent Factory Service [medium]
- Dynamic Agent Executor [medium]

Complexity: 2 medium
Progress: 1/5 milestones done

Goal: Create the factory and executor services for template-based agent creation
```

### Milestone Retro

Posted when all features in a milestone are done:

```
🏁 Agent Architect — Milestone 2/5 Complete
### Agent Factory & Execution

Features Shipped: 2
- Agent Factory Service — PR#243
- Dynamic Agent Executor — PR#245

Total Cost: $0.42
Avg per Feature: $0.21

Duration: 2h

What's Next: Milestone 3 — Consumer Migration
3 phases planned
```

### Project Retro

Posted when all milestones complete. Uses an LLM to generate a structured retrospective from project data:

```
🎉 Agent Architect — Project Complete!

## What Went Well
- Template validation caught 3 malformed configs before they hit production
- Factory inheritance pattern reduced boilerplate by ~40%
...

## What Went Wrong
- 2 features required retries due to stale worktrees
...

## Lessons Learned
- Always rebuild packages after type changes
...

## Action Items
- Add pre-flight worktree freshness check to auto-mode
...
```

## Service Architecture

**Location:** `apps/server/src/services/ceremony-service.ts`

**Dependencies:**

- `EventEmitter` — subscribes to lifecycle events
- `SettingsService` — reads ceremony config per project
- `FeatureLoader` — loads features for metrics
- `ProjectService` — loads project/milestone data

**Initialization:** `apps/server/src/index.ts:388`

**Singleton:** `ceremonyService` exported from module

### Key Methods

| Method                        | Visibility | Purpose                                           |
| ----------------------------- | ---------- | ------------------------------------------------- |
| `initialize()`                | public     | Wire up dependencies and event subscriptions      |
| `destroy()`                   | public     | Cleanup subscriptions                             |
| `handleMilestoneStarted()`    | private    | Generate + post standup                           |
| `handleMilestoneCompleted()`  | private    | Generate + post retro                             |
| `handleProjectCompleted()`    | private    | Generate + post LLM retro                         |
| `generateMilestoneStandup()`  | private    | Build standup content from project data           |
| `generateMilestoneCeremony()` | private    | Build retro content with features, cost, duration |
| `getCeremonySettings()`       | private    | Load config from project settings                 |
| `splitMessage()`              | private    | Chunk content for Discord's 2000-char limit       |
| `emitDiscordEvent()`          | private    | Emit `integration:discord` event                  |

## Discord Delivery

CeremonyService doesn't call Discord directly. Instead, it emits `integration:discord` events via `emitDiscordEvent()`, and a bridge listener in `apps/server/src/index.ts` forwards them to `DiscordBotService.sendToChannel()`.

```
CeremonyService
  │
  └─ emitDiscordEvent(channelId, content)
        │
        ▼
  events.emit('integration:discord', {
    action: 'send_message',
    channelId,
    content
  })
        │
        ▼
  Bridge listener (index.ts)
        │
        ▼
  DiscordBotService.sendToChannel(channelId, content)
        │
        ▼
  Discord API
```

This bridge also serves `IntegrationService` and `ChangelogService` — any service that emits `integration:discord` events with `{ action: 'send_message', channelId, content }` payloads will be delivered to Discord.

**Key file:** `apps/server/src/index.ts` — `integration:discord` subscriber (after `eventHookService.initialize()`)

## Prerequisites

For ceremonies to work:

1. **Ceremonies enabled** in `.automaker/settings.json` (`ceremonySettings.enabled: true`)
2. **Discord channel ID set** in ceremony settings (`ceremonySettings.discordChannelId`)
3. **Discord bot running** — `DiscordBotService` must be initialized (requires `DISCORD_BOT_TOKEN`)
4. **Project uses the project orchestration system** (milestones, phases)
5. **Events emitted by ProjM agent** — ceremonies are event-driven, not polled

## Planned Ceremonies

### Board Groom Ceremony

Planned automated board grooming ceremony. This would:

- Run on a schedule (daily or per-milestone)
- Identify stale features (in-progress > 24h with no agent)
- Check for orphaned worktrees
- Verify dependency chains
- Post a grooming report to Discord

### Documentation Ceremony

Auto-generate or update docs when features complete or milestones finish:

- Update relevant docs when a feature ships
- Generate changelog entries
- Flag stale documentation
- Post doc update summary to Discord

## Related Documentation

- [Discord Communication Guide](/integrations/discord) — Channel structure and integration
- [Architecture Overview](./architecture.md) — How ceremonies fit into the agent system
- [MCP Integration](./mcp-integration.md) — Programmatic ceremony control (future)
