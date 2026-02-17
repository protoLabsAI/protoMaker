# Crew Loop System

The Crew Loop system provides unified scheduling for team members (Ava, Frank, GTM, PR Maintainer, Board Janitor, System Health, PR State Sync). Each member runs a lightweight in-process check on an independent cron schedule. When a check detects problems, the system escalates by spawning the member's agent template via `DynamicAgentExecutor`.

## Architecture

```
SchedulerService (cron tick every 60s)
  --> CrewLoopService.runCheck(memberId)
    --> member.check(context) — lightweight, in-process, no API calls
      --> IF needsEscalation: DynamicAgentExecutor.execute(template, prompt)
      --> ELSE: log "ok", emit event, done
```

## Adding a New Crew Member

Create a single file in `apps/server/src/services/crew-members/`:

```typescript
import type { CrewMemberDefinition, CrewCheckContext, CrewCheckResult } from '../crew-loop-service.js';

export const myCrewMember: CrewMemberDefinition = {
  id: 'my-agent',
  displayName: 'My Agent',
  templateName: 'my-agent',           // RoleRegistryService template
  defaultSchedule: '*/10 * * * *',    // cron
  enabledByDefault: true,
  check: async (ctx) => { ... },       // lightweight check, returns findings
  buildEscalationPrompt: (result) => ..., // prompt for agent when escalated
  escalationTools: ['Read', 'Bash'],   // allowed tools during escalation
};
```

Then register it in `index.ts`:

```typescript
await crewLoopService.registerMember(myCrewMember);
```

Re-export from `crew-members/index.ts`.

## Current Crew Members

| Member        | ID              | Schedule                | Default  | Purpose                                                                    |
| ------------- | --------------- | ----------------------- | -------- | -------------------------------------------------------------------------- |
| Ava           | `ava`           | `*/10 * * * *` (10 min) | Enabled  | Stuck agents, blocked features, auto-mode health, capacity                 |
| Frank         | `frank`         | `*/10 * * * *` (10 min) | Enabled  | Server health, memory, capacity, health monitor, worktree health           |
| GTM           | `gtm`           | `0 */6 * * *` (6 hours) | Disabled | Content pipeline (placeholder)                                             |
| PR Maintainer | `pr-maintainer` | `*/10 * * * *` (10 min) | Enabled  | Stale PRs, auto-merge, CodeRabbit threads, orphaned worktrees              |
| Board Janitor | `board-janitor` | `*/10 * * * *` (10 min) | Enabled  | Merged-not-done, orphaned in-progress, broken deps, stale blocked          |
| System Health | `system-health` | `*/10 * * * *` (10 min) | Enabled  | System RAM, swap, disk, CPU load, temperature, GPU/VRAM, zombie processes  |
| PR State Sync | `pr-state-sync` | `*/5 * * * *` (5 min)   | Enabled  | GitHub-to-board state drift detection (merged PRs, CI failures, stale PRs) |

## API Endpoints

All endpoints require authentication.

### GET /api/crew/status

Returns all registered crew members with their states.

### POST /api/crew/:id/trigger

Manually trigger a crew member check outside its normal schedule.

### POST /api/crew/:id/enable

Enable a crew member and activate its scheduler task.

### POST /api/crew/:id/disable

Disable a crew member and deactivate its scheduler task.

### POST /api/crew/:id/schedule

Update a crew member's cron schedule.

**Body:** `{ "schedule": "*/15 * * * *" }`

## Settings

Crew loop settings are stored in global settings under `crewLoops`:

```json
{
  "crewLoops": {
    "enabled": true,
    "members": {
      "ava": { "enabled": true, "schedule": "*/10 * * * *" },
      "frank": { "enabled": true },
      "gtm": { "enabled": false }
    }
  }
}
```

## Events

The crew loop system emits these events:

- `crew:check-started` — A member check is beginning
- `crew:check-completed` — A member check finished (includes severity, summary)
- `crew:escalation-started` — An agent is being spawned for escalation
- `crew:escalation-completed` — The escalation agent finished

## What Was Consolidated

| Previous System                                             | Replaced By                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `maintenance:ava-heartbeat` (Sonnet API call every 30min)   | Ava crew loop (lightweight check, escalates only when needed) |
| Frank inline auto-triage in `index.ts`                      | Frank crew loop                                               |
| `healthMonitorService.startMonitoring()` (own 30s timer)    | Frank crew loop calls `runHealthCheck()` on-demand            |
| Standalone `GraphiteSyncScheduler` (setTimeout/setInterval) | Registered as `maintenance:graphite-sync` scheduler task      |

### Kept Unchanged

| System                          | Reason                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| SchedulerService                | Core cron infrastructure — crew loops register as tasks      |
| Maintenance tasks (7 remaining) | Infrastructure automation (PR merge, worktree cleanup, etc.) |
| AvaGatewayService event routing | Real-time alert routing to Discord/Beads                     |
| HealthMonitorService            | Data source — `runHealthCheck()` called on-demand by Frank   |
