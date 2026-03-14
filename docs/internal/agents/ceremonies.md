# Agile ceremony system

protoLabs's Ceremony Service automates agile ceremonies -- standups, retros, and project retros -- posting structured updates to Discord as projects progress through their lifecycle. Ceremonies are implemented as LangGraph flows invoked by the event-driven `CeremonyService`.

## Ceremony types

### Implemented

Three ceremony types are fully implemented as LangGraph flows:

| Ceremony              | Trigger Event         | LangGraph Flow             | What It Posts                                                             | Setting                  |
| --------------------- | --------------------- | -------------------------- | ------------------------------------------------------------------------- | ------------------------ |
| **Milestone Standup** | `milestone:started`   | `createStandupFlow()`      | Planned phases, complexity breakdown, progress                            | `enableStandups`         |
| **Milestone Retro**   | `milestone:completed` | `createRetroFlow()`        | Features shipped, PRs, cost, duration, blockers, next steps               | `enableMilestoneUpdates` |
| **Project Retro**     | `project:completed`   | `createProjectRetroFlow()` | LLM-generated retrospective (what went well/wrong, lessons, action items) | `enableProjectRetros`    |

### Defined but not yet implemented

Four additional ceremony types are defined in the type system and have settings toggles, but do not yet have LangGraph flow implementations:

| Ceremony              | Trigger Event               | Setting               | Status  |
| --------------------- | --------------------------- | --------------------- | ------- |
| **Epic Kickoff**      | `project:features:progress` | `enableEpicKickoff`   | Planned |
| **Epic Delivery**     | `feature:completed` (epic)  | `enableEpicDelivery`  | Planned |
| **Content Brief**     | `milestone:completed`       | `enableContentBriefs` | Planned |
| **Post-Project Docs** | `project:completed`         | --                    | Planned |

## LangGraph flow architecture

Each implemented ceremony is a LangGraph state graph created by a factory function in `@protolabsai/flows`. The `CeremonyService` subscribes to events, resolves settings, and invokes the appropriate flow.

```
Event (milestone:started, milestone:completed, project:completed)
  |
  v
CeremonyService
  |  - Check ceremonySettings.enabled
  |  - Check per-ceremony toggle
  |  - Resolve Discord channel ID
  |  - Create ChatAnthropic model from ceremonySettings.retroModel
  |
  v
LangGraph Flow (createStandupFlow / createRetroFlow / createProjectRetroFlow)
  |  - Gather data from ProjectService / FeatureLoader
  |  - Generate content (LLM for retros)
  |  - Post to Discord via adapter
  |
  v
Audit + Event
  |  - auditLog.record() with delivery status
  |  - emit('ceremony:fired', { type, projectSlug, ... })
```

The Discord adapter uses the event system (`integration:discord` events) rather than calling `DiscordBotService` directly. This decouples ceremony delivery from the Discord bot lifecycle.

## Configuration

Ceremonies are configured per-project via **Project Settings** in the UI, or in `.automaker/settings.json`:

```json
{
  "ceremonySettings": {
    "enabled": true,
    "discordChannelId": "<channel-id>",
    "enableStandups": true,
    "enableMilestoneUpdates": true,
    "enableProjectRetros": true,
    "enableEpicKickoff": true,
    "enableEpicDelivery": true,
    "enableContentBriefs": true,
    "contentBriefChannelId": "<gtm-channel-id>",
    "retroModel": {
      "model": "sonnet"
    }
  }
}
```

### Settings reference

| Field                    | Type    | Default               | Description                                      |
| ------------------------ | ------- | --------------------- | ------------------------------------------------ |
| `enabled`                | boolean | `true`                | Master toggle for all ceremonies                 |
| `discordChannelId`       | string  | --                    | Discord channel ID override for ceremony posts   |
| `enableStandups`         | boolean | `true`                | Post standup when milestone starts               |
| `enableMilestoneUpdates` | boolean | `true`                | Post retro when milestone completes              |
| `enableProjectRetros`    | boolean | `true`                | Post LLM retro when project completes            |
| `enableEpicKickoff`      | boolean | `true`                | Post kickoff when epic is created (not yet impl) |
| `enableEpicDelivery`     | boolean | `true`                | Post delivery when epic completes (not yet impl) |
| `enableContentBriefs`    | boolean | `true`                | Generate GTM content brief (not yet impl)        |
| `contentBriefChannelId`  | string  | --                    | Separate Discord channel for content briefs      |
| `retroModel`             | object  | `{ model: 'sonnet' }` | Model config for LLM-generated ceremonies        |

**Model configuration:** The `retroModel.model` field accepts any model alias recognized by `@protolabsai/model-resolver` (e.g., `"sonnet"`, `"opus"`, `"haiku"`) or a full model ID string. This controls the Claude model used for retro generation. Default is Sonnet.

**Type definition:** `libs/types/src/settings.ts` -> `CeremonySettings`

## Event flow

### Completion cascade (CompletionDetectorService)

The cascade is driven by `CompletionDetectorService`, which reacts to feature status changes:

```
feature:status-changed (newStatus: 'done')
  |  or
auto-mode:event (type: 'auto_mode_feature_complete', passes: true)
  |
  +-- Epic check: all children done? -> mark epic done
  |     +-- emit('feature:completed', { isEpic: true })
  |
  +-- Milestone check: all phases done? -> mark milestone completed
  |     +-- emit('milestone:completed', payload)
  |
  +-- Project check: all milestones done? -> mark project completed
        +-- emit('project:completed', payload)
```

Each level has deduplication guards to prevent double-firing.

### CeremonyService event handling

```
milestone:started  ---> CeremonyService.handleMilestoneStarted()
                              -> createStandupFlow() -> Discord post

milestone:completed --> CeremonyService.handleMilestoneCompleted()
                              -> createRetroFlow() -> Discord post

project:completed  ---> CeremonyService.handleProjectCompleted()
                              -> createProjectRetroFlow() -> Discord post
                              -> Reflection loop (memory synthesis)
```

## Ceremony artifacts

After each implemented ceremony flow completes, `CeremonyService` persists a structured artifact via `ProjectArtifactService`:

- **Milestone retro** (`milestone:completed`) — saves a `ceremony-report` artifact with `ceremonyType: 'milestone_retro'`
- **Project retro** (`project:completed`) — saves a `ceremony-report` artifact with `ceremonyType: 'project_retro'`

Artifacts are stored at:

```text
{projectPath}/.automaker/projects/{slug}/artifacts/ceremony-report/{id}.json
```

Each artifact includes the ceremony type, milestone/project metadata, and a completion timestamp. Artifact persistence is non-blocking and non-fatal — a failure to save an artifact does not affect ceremony delivery.

See [Project Artifacts](../dev/project-lifecycle#project-artifacts) for the full artifacts API.

## Audit log and observability

### Ceremony audit log

Every ceremony event is recorded to a JSONL append-only log at `.automaker/ceremony-log.jsonl`. Each entry includes the ceremony type, project, delivery status, and timing.

**Service:** `apps/server/src/services/ceremony-audit-service.ts` -> `CeremonyAuditLogService`

**Key methods:**

| Method                   | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `record(entry)`          | Append a ceremony event to the JSONL log             |
| `getRecentEntries()`     | Get entries in reverse chronological order           |
| `getEntriesByType()`     | Filter entries by ceremony type                      |
| `updateDeliveryStatus()` | Update an entry's delivery status after Discord send |
| `getDeliverySummary()`   | Aggregate delivery stats (delivered/pending/failed)  |

### WebSocket event: `ceremony:fired`

After each ceremony completes, `CeremonyService` emits a `ceremony:fired` WebSocket event. The UI subscribes to this for live updates in the Ceremonies feed.

**Payload:**

```typescript
{
  type: string;           // e.g. 'standup', 'milestone_retro', 'project_retro'
  projectPath: string;
  projectSlug?: string;
  milestoneSlug?: string;
}
```

### REST API endpoints

| Method | Endpoint                  | Purpose                              |
| ------ | ------------------------- | ------------------------------------ |
| GET    | `/api/ceremonies/status`  | Ceremony status + delivery summary   |
| GET    | `/api/ceremonies/log`     | Audit log entries (with type filter) |
| POST   | `/api/ceremonies/trigger` | Manually trigger a ceremony          |
| POST   | `/api/ceremonies/retry`   | Clear dedup guard and re-trigger     |

**`GET /api/ceremonies/log` query parameters:**

- `projectPath` (required) -- project directory path
- `limit` (optional, default: 50) -- max entries to return
- `type` (optional) -- filter by ceremony type

### UI: Ceremonies feed

The Ceremonies page (`/ceremonies`) displays a live feed of ceremony events with filtering:

- **Type filter tabs:** All, Kickoffs, Standups, Retros, Deliveries, Briefs, Project
- **Status filter:** All, Delivered, Pending, Failed, Skipped
- **Live updates** via `ceremony:fired` WebSocket events
- **Sidebar badge** shows unread ceremony count

**Key files:**

- `apps/ui/src/routes/ceremonies.tsx` -- Route definition
- `apps/ui/src/components/views/ceremonies-view.tsx` -- Page component
- `apps/ui/src/store/ceremony-store.ts` -- Zustand store
- `apps/ui/src/hooks/use-ceremony-events.ts` -- WebSocket subscription + data loading

## Ceremony content examples

### Milestone standup

Posted when a milestone starts work:

```
Agent Architect -- Milestone 2/5 Starting
### Standup: Agent Factory & Execution

Planned Phases: 2
- Agent Factory Service [medium]
- Dynamic Agent Executor [medium]

Complexity: 2 medium
Progress: 1/5 milestones done

Goal: Create the factory and executor services for template-based agent creation
```

### Milestone retro

Posted when all features in a milestone are done:

```
Agent Architect -- Milestone 2/5 Complete
### Agent Factory & Execution

Features Shipped: 2
- Agent Factory Service -- PR#243
- Dynamic Agent Executor -- PR#245

Total Cost: $0.42
Avg per Feature: $0.21

Duration: 2h

What's Next: Milestone 3 -- Consumer Migration
3 phases planned
```

### Project retro

Posted when all milestones complete. Uses an LLM to generate a structured retrospective from project data:

```
Agent Architect -- Project Complete!

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

## Discord delivery

CeremonyService doesn't call Discord directly. Instead, it emits `integration:discord` events via a lightweight adapter, and a bridge listener forwards them to `DiscordBotService.sendToChannel()`.

```
CeremonyService
  |
  +-- createDiscordAdapter(emitter).sendMessage(channelId, content)
        |
        v
  events.emit('integration:discord', {
    action: 'send_message',
    channelId,
    content
  })
        |
        v
  Bridge listener -> DiscordBotService.sendToChannel() -> Discord API
```

## Automatic standup scheduling

When a project launches (`project:lifecycle:launched` event), `CeremonyService` registers a recurring cron task with `SchedulerService` to emit `milestone:started` events on the configured cadence (default: `0 9 * * 1` — every Monday at 9 AM).

```
project:lifecycle:launched
  |
  v
CeremonyService.handleProjectLifecycleLaunched()
  |-- Reads ceremony-state.json for standupCadence
  |-- Registers "pm-standup-{slug}" task with SchedulerService
  |     cadence: state.standupCadence (default: "0 9 * * 1")
  |     handler: emit('milestone:started', ...)
  v
SchedulerService (cron engine) fires task on schedule
  |
  v
CeremonyService.handleMilestoneStarted() → standup flow runs
```

When a project completes (`project:completed`), the standup task is automatically unregistered.

## Ceremony state machine

`CeremonyService` persists a `CeremonyState` file per project at:

```text
{projectPath}/.automaker/projects/{slug}/ceremony-state.json
```

The state machine transitions are applied by `ceremony-state-machine.ts`. States track the current ceremony phase and milestone progress:

| Event                           | Typical Transition            |
| ------------------------------- | ----------------------------- |
| `project:lifecycle:launched`    | `awaiting_kickoff` → active   |
| `milestone:completed`           | Updates `currentMilestone`    |
| `ceremony:fired(retro)`         | Records milestone retro fired |
| `ceremony:fired(project_retro)` | Records project retro fired   |
| `project:completed`             | Final phase transition        |

State is read/written via `getCeremonyState()` / `applyTransition()`.

## Service architecture

**Location:** `apps/server/src/services/ceremony-service.ts`

**Dependencies:**

- `EventEmitter` -- subscribes to lifecycle events
- `SettingsService` -- reads ceremony config per project
- `FeatureLoader` -- loads features for metrics
- `ProjectService` -- loads project/milestone data
- `CeremonyAuditLogService` -- records audit entries (optional, set via `setAuditLog()`)
- `SchedulerService` -- registers/unregisters scheduled standup tasks (optional, set via `setSchedulerService()`)

**LangGraph flow factories** (from `@protolabsai/flows`):

- `createStandupFlow()` -- milestone standup
- `createRetroFlow()` -- milestone retrospective
- `createProjectRetroFlow()` -- project retrospective

## Manual testing

### Via MCP tool

Use the `trigger_ceremony` MCP tool for quick testing:

```typescript
// Milestone standup
mcp__plugin_protolabs_studio__trigger_ceremony({
  projectPath: '/path/to/project',
  projectSlug: 'my-project',
  milestoneSlug: 'foundation',
  ceremonyType: 'standup',
});

// Milestone retro
mcp__plugin_protolabs_studio__trigger_ceremony({
  projectPath: '/path/to/project',
  projectSlug: 'my-project',
  milestoneSlug: 'foundation',
  ceremonyType: 'retro',
});

// Project retro (no milestoneSlug needed)
mcp__plugin_protolabs_studio__trigger_ceremony({
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

## Troubleshooting

### Ceremonies not firing

1. **Check master toggle:** `ceremonySettings.enabled` must be `true` in project settings
2. **Check individual toggles:** Each ceremony type has its own enable flag
3. **Verify Discord config:** `discordChannelId` must be set (project-level or via `integrations.discord.channels.ceremonies`)
4. **Verify Discord bot:** `DISCORD_BOT_TOKEN` must be set and bot must be running
5. **Check guild membership:** Bot must be in the Discord server with send-message permissions
6. **Check completion cascade:** Features must transition to `done` status to trigger milestone/project checks
7. **Check deduplication:** Each ceremony has a dedup guard -- use `/api/ceremonies/retry` to clear it

### Discord messages not appearing

1. Check the audit log: `GET /api/ceremonies/log?projectPath=...`
2. Look for `deliveryStatus: 'failed'` entries with error details
3. Verify the channel ID exists and the bot can post to it
4. Check server logs for `integration:discord` bridge errors

## Prerequisites

For ceremonies to work:

1. **Ceremonies enabled** in project settings (`ceremonySettings.enabled: true`)
2. **Discord integration configured** -- either project-level or global Discord settings
3. **Discord bot running** -- `DiscordBotService` must be initialized (requires `DISCORD_BOT_TOKEN`)
4. **Project uses the project orchestration system** (milestones, phases)
5. **Events emitted by completion cascade** -- ceremonies are event-driven, not polled

## Related

- [Discord communication guide](/integrations/discord) -- Channel structure and integration
- [Architecture overview](./architecture) -- How ceremonies fit into the agent system
- [MCP integration](./mcp-integration) -- Programmatic ceremony control
- [Inbox system](../dev/inbox-system) -- Ceremony entries in the unified inbox
- [Langfuse integration](../integrations/langfuse) -- Tracing and quality scoring
