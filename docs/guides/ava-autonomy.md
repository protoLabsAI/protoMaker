# Configure Ava Autonomous Capabilities

This guide covers three autonomous capabilities in Ava: self-scheduling recurring tasks, storing and recalling information with persistent memory, and gateway health monitoring with auto-remediation. After reading it, you will be able to configure all three for your project.

## Prerequisites

- protoLabs Studio running with a project open
- Ava chat accessible (`/chat` route)
- `.automaker/ava-config.json` writable for the project (created automatically on first save)

## Set Up Self-Scheduling

Ava can schedule recurring tasks that invoke a stored prompt on a cron schedule or fixed interval. Tasks persist across server restarts via `.automaker/ava-tasks.json`.

### Enable the scheduling tool group

The `scheduling` group is enabled by default. To verify or explicitly enable it:

```json
{
  "toolGroups": {
    "scheduling": true
  }
}
```

Save this to `.automaker/ava-config.json` in your project root.

### Schedule a task via chat

In the Ava chat, ask Ava to schedule a task:

```
Schedule a daily board summary every weekday morning at 9am.
Prompt: "Summarize the current board state: how many features are in progress,
how many are blocked, and any features that have been stuck for more than 2 days."
```

Ava calls `schedule_task` with a cron expression and stores the task. The task ID is prefixed `ava:` automatically.

To schedule on a fixed interval instead of a cron:

```
Check for stuck features every 2 hours.
Prompt: "List any features that have been in_progress for more than 6 hours without an update."
```

### View scheduled tasks

```
List my scheduled tasks.
```

Ava calls `list_scheduled_tasks` and returns task IDs, schedules, last/next run times, and failure counts.

### Cancel a task

```
Cancel the task ava:daily-board-summary.
```

Ava calls `cancel_task`. Only `ava:`-prefixed tasks can be cancelled.

### Trigger a task immediately

```
Run the ava:daily-board-summary task now.
```

Ava calls `trigger_task` and returns the result of the prompt invocation.

### Cron expression reference

| Expression     | Meaning             |
| -------------- | ------------------- |
| `0 9 * * 1-5`  | Weekdays at 9:00 AM |
| `0 */2 * * *`  | Every 2 hours       |
| `*/30 * * * *` | Every 30 minutes    |
| `0 0 * * *`    | Daily at midnight   |

## Use Persistent Memory

The `memory` tool group lets Ava store and retrieve information across chat sessions. Memory is stored at `.automaker/ava-memory.json`.

### Enable the memory tool group

The `memory` group is enabled by default. To verify or explicitly enable it:

```json
{
  "toolGroups": {
    "memory": true
  }
}
```

### Store information

Ask Ava to remember something:

```
Remember that our deploy process requires a manual approval step in the #deployments channel.
Key: deploy-process
Tags: ops, deploy
```

Ava calls `remember`. If the key already exists, the content and tags are updated.

### Recall information

```
What do you know about our deploy process?
```

Ava calls `recall` with the query. Results are returned in ranked tiers:

1. Exact key match
2. Tag match
3. Substring match in key or content

### Remove a memory

```
Forget the deploy-process memory — it's outdated.
```

Ava calls `forget` with the exact key.

### Common memory patterns

Store preferences and decisions that Ava should carry across sessions:

```
Remember that we use conventional commits (feat/fix/refactor/chore) and squash-merge feature PRs.
Key: commit-conventions
Tags: git, workflow
```

```
Remember that the staging environment URL is https://staging.example.com and deploys happen automatically on push to staging.
Key: staging-env
Tags: ops, deploy, staging
```

## Enable Gateway Auto-Remediation

The Ava Gateway (`AvaGatewayService`) runs periodic heartbeat checks on the board and integrates with `HealthMonitorService` to automatically fix detected issues.

### How it works

When protoLabs Studio starts, `AvaGatewayService` initializes with `HealthMonitorService` and registers your project for monitoring. The health monitor runs checks every 5 minutes and automatically remediates issues that are marked auto-remediable (for example, clearing worktree locks on stuck features).

The gateway also subscribes to critical server events and sends alerts to the configured Discord `#infra` channel.

### Configure the infra channel

Set the `DISCORD_CHANNEL_INFRA` environment variable to your Discord infra channel ID:

```bash
DISCORD_CHANNEL_INFRA=1469109809939742814
```

The gateway posts startup messages and critical alerts to this channel.

### View gateway status

```bash
GET /api/ava/status
```

Returns the current gateway state:

```json
{
  "initialized": true,
  "listening": true,
  "lastHeartbeat": "2026-03-21T09:00:00.000Z",
  "lastHeartbeatStatus": "ok",
  "totalHeartbeats": 42,
  "totalAlerts": 1,
  "circuitBreaker": {
    "isOpen": false,
    "failureCount": 0
  }
}
```

### Circuit breaker behavior

The gateway includes a circuit breaker that opens after 5 consecutive failures. When open, heartbeat evaluations are skipped for 5 minutes. The circuit resets automatically after the cooldown.

If alerts are firing repeatedly, check `/api/ava/status` for `circuitBreaker.isOpen` and `failureCount`.

## Next steps

- **[Timer Registry](../internal/server/timer-registry.md)** — View and control scheduled tasks from the Ops Dashboard
- **[Ava Chat System](../internal/server/ava-chat.md)** — Architecture reference for all Ava tool groups
