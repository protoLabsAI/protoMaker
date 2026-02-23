# Agile Ceremony System

protoLabs's Ceremony Service automates agile ceremonies — standups, milestone retros, project retros, and board grooming — posting structured updates to Discord as projects progress through their lifecycle.

## Ceremony Types

| Ceremony              | Trigger Event               | What It Posts                                                             | Setting                  |
| --------------------- | --------------------------- | ------------------------------------------------------------------------- | ------------------------ |
| **Epic Kickoff**      | `project:features:progress` | Planned phases, complexity breakdown, estimated scope                     | `enableEpicKickoff`      |
| **Milestone Standup** | `milestone:started`         | Planned phases, complexity breakdown, progress                            | `enableStandups`         |
| **Milestone Retro**   | `milestone:completed`       | Features shipped, PRs, cost, duration, blockers, next steps               | `enableMilestoneUpdates` |
| **Epic Delivery**     | `feature:completed` (epic)  | Child features, PRs, cost, duration for the completed epic                | `enableEpicDelivery`     |
| **Content Brief**     | `milestone:completed`       | LLM-generated GTM content brief for blog posts, tweets, case studies      | `enableContentBriefs`    |
| **Project Retro**     | `project:completed`         | LLM-generated retrospective (what went well/wrong, lessons, action items) | `enableProjectRetros`    |
| **Board Groom**       | _(planned)_                 | Stale features, blockers, queue health, recommended actions               | _(not yet implemented)_  |

## Configuration

Ceremonies are configured per-project via **Project Settings > Ceremonies** in the UI, or in `.automaker/settings.json`:

```json
{
  "ceremonySettings": {
    "enabled": true,
    "discordChannelId": "<channel-id>",
    "enableEpicKickoff": true,
    "enableStandups": true,
    "enableMilestoneUpdates": true,
    "enableEpicDelivery": true,
    "enableProjectRetros": true,
    "enableContentBriefs": true,
    "contentBriefChannelId": "<gtm-channel-id>",
    "retroModel": {
      "model": "sonnet"
    }
  }
}
```

**Settings reference:**

| Field                        | Type    | Default               | Description                                      |
| ---------------------------- | ------- | --------------------- | ------------------------------------------------ |
| `enabled`                    | boolean | `false`               | Master toggle for all ceremonies                 |
| `discordChannelId`           | string  | —                     | Discord channel ID override for ceremony posts   |
| `enableEpicKickoff`          | boolean | `true`                | Post kickoff when epic is created                |
| `enableStandups`             | boolean | `true`                | Post standup when milestone starts               |
| `enableMilestoneUpdates`     | boolean | `true`                | Post retro when milestone completes              |
| `enableEpicDelivery`         | boolean | `true`                | Post delivery announcement when epic completes   |
| `enableProjectRetros`        | boolean | `true`                | Post LLM retro when project completes            |
| `enableContentBriefs`        | boolean | `true`                | Generate GTM content brief on milestone complete |
| `contentBriefChannelId`      | string  | —                     | Separate Discord channel for content briefs      |
| `enableLinearProjectUpdates` | boolean | `false`               | Post standups/milestones to Linear project too   |
| `retroModel`                 | object  | `{ model: 'sonnet' }` | Model config for LLM-generated retros            |

**Type definition:** `libs/types/src/settings.ts` → `CeremonySettings`

## Event Flow

### Completion Cascade (CompletionDetectorService)

The cascade is driven by `CompletionDetectorService`, which reacts to feature status changes:

```
feature:status-changed (newStatus: 'done')
  │  or
auto-mode:event (type: 'auto_mode_feature_complete', passes: true)
  │
  ├─ Epic check: all children done? → mark epic done
  │     └─ emit('feature:completed', { isEpic: true })
  │
  ├─ Milestone check: all phases done? → mark milestone completed
  │     └─ emit('milestone:completed', payload)
  │
  └─ Project check: all milestones done? → mark project completed
        └─ emit('project:completed', payload)
```

Each level has deduplication guards to prevent double-firing.

### Ceremony Service Event Handling

```
epic created ────────→ CeremonyService.handleEpicCreated()
                              → Epic kickoff announcement

milestone:started ───→ CeremonyService.handleMilestoneStarted()
                              → Standup announcement

milestone:completed ─→ CeremonyService.handleMilestoneCompleted()
                              → Milestone retro
                              → Content brief (separate channel)
                              → Linear project update (optional)

feature:completed ───→ CeremonyService.handleEpicCompleted()
  (isEpic: true)             → Epic delivery announcement

project:completed ───→ CeremonyService.handleProjectCompleted()
                              → LLM retrospective
                              → Impact report
                              → Reflection loop (memory synthesis)
                              → Improvement items (Beads/features)

project:completed ───→ ReflectionService.handleProjectCompleted()
                              → LLM reflection → reflection.md
                              → emit('project:reflection:complete')
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

| Method                       | Visibility | Purpose                                           |
| ---------------------------- | ---------- | ------------------------------------------------- |
| `initialize()`               | public     | Wire up dependencies and event subscriptions      |
| `destroy()`                  | public     | Cleanup subscriptions                             |
| `handleEpicCreated()`        | private    | Generate + post epic kickoff                      |
| `handleMilestoneStarted()`   | private    | Generate + post standup                           |
| `handleMilestoneCompleted()` | private    | Generate + post retro + content brief             |
| `handleEpicCompleted()`      | private    | Generate + post epic delivery announcement        |
| `handleProjectCompleted()`   | private    | Generate + post LLM retro + reflection loop       |
| `generateReflectionLoop()`   | private    | Synthesize agent memory into project learnings    |
| `createImprovementItems()`   | private    | Extract action items from retro as Beads/features |
| `getCeremonySettings()`      | private    | Load config from project settings                 |
| `splitMessage()`             | private    | Chunk content for Discord's 2000-char limit       |
| `emitDiscordEvent()`         | private    | Emit `integration:discord` event                  |

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

## Manual Testing

### Via MCP Tool

Use the `trigger_ceremony` MCP tool for quick testing:

```typescript
// Milestone standup
mcp__plugin_automaker_automaker__trigger_ceremony({
  projectPath: '/path/to/project',
  projectSlug: 'my-project',
  milestoneSlug: 'foundation',
  ceremonyType: 'standup',
});

// Milestone retro
mcp__plugin_automaker_automaker__trigger_ceremony({
  projectPath: '/path/to/project',
  projectSlug: 'my-project',
  milestoneSlug: 'foundation',
  ceremonyType: 'retro',
});

// Project retro (no milestoneSlug needed)
mcp__plugin_automaker_automaker__trigger_ceremony({
  projectPath: '/path/to/project',
  projectSlug: 'my-project',
  ceremonyType: 'project-retro',
});
```

### Via API

```bash
# Milestone retro
curl -X POST http://localhost:3008/api/ceremonies/trigger \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AUTOMAKER_API_KEY" \
  -d '{
    "projectPath": "/path/to/project",
    "projectSlug": "my-project",
    "milestoneSlug": "foundation",
    "ceremonyType": "retro"
  }'

# Project retro
curl -X POST http://localhost:3008/api/ceremonies/trigger \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AUTOMAKER_API_KEY" \
  -d '{
    "projectPath": "/path/to/project",
    "projectSlug": "my-project",
    "ceremonyType": "project-retro"
  }'
```

### Via UI

Go to **Project Settings > Ceremonies** to enable/disable ceremony types and configure channels.

### Testing Checklist

1. Enable ceremonies in Project Settings > Ceremonies
2. Set a Discord channel ID (or use project default)
3. Trigger a standup — verify Discord message format
4. Trigger a milestone retro — verify features, cost, PR links
5. Trigger a project retro — verify LLM generates retrospective
6. Check deduplication — trigger same ceremony twice, expect one post
7. Disable a ceremony type — trigger again, expect skip

## Prerequisites

For ceremonies to work:

1. **Ceremonies enabled** in project settings (`ceremonySettings.enabled: true`)
2. **Discord integration configured** — either project-level or global Discord settings
3. **Discord bot running** — `DiscordBotService` must be initialized (requires `DISCORD_BOT_TOKEN`)
4. **Project uses the project orchestration system** (milestones, phases)
5. **Events emitted by completion cascade** — ceremonies are event-driven, not polled

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
