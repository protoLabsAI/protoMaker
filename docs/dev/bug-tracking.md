# Bug Tracking Pipeline

The bug tracking pipeline automatically creates Linear issues from feature failures, routing bugs to a dedicated "Bugs" project with priority-based severity.

## Architecture

```
feature:permanently-blocked / recovery_escalated / pr:ci-failure
  --> IssueCreationService (creates GitHub issue)
  --> emits bug:linear-sync (if bugs.enabled && priority meets threshold)
  --> index.ts listener creates Linear issue in Bugs project
```

## Configuration

Bug tracking is configured per-project in `.automaker/settings.json` under `workflow.bugs`:

```json
{
  "workflow": {
    "bugs": {
      "enabled": true,
      "linearProjectId": "proj_abc123",
      "linearTeamId": "team_xyz",
      "createGithubIssues": true,
      "minLinearPriority": 3
    }
  }
}
```

### Settings

| Setting              | Type    | Default | Description                                                          |
| -------------------- | ------- | ------- | -------------------------------------------------------------------- |
| `enabled`            | boolean | `false` | Enable bug tracking pipeline                                         |
| `linearProjectId`    | string  | -       | Linear project ID for the "Bugs" project (required for Linear sync)  |
| `linearTeamId`       | string  | -       | Linear team ID (falls back to `integrations.linear.teamId`)          |
| `createGithubIssues` | boolean | `true`  | Also create GitHub issues (existing behavior)                        |
| `minLinearPriority`  | number  | `3`     | Minimum severity for Linear issue: 1=urgent, 2=high, 3=medium, 4=low |

## Priority Mapping

Priority is derived from `TriageService` based on failure context:

| Priority | Label  | Linear Priority | Description                                            |
| -------- | ------ | --------------- | ------------------------------------------------------ |
| 1        | Urgent | P1              | Authentication/quota failures, critical infrastructure |
| 2        | High   | P2              | Persistent test failures, dependency issues            |
| 3        | Medium | P3              | Tool errors, validation failures                       |
| 4        | Low    | P4              | Transient errors, merge conflicts                      |

## Event Flow

### Triggers

The pipeline activates on three event types:

1. **`feature:permanently-blocked`** - Feature exceeded max retries (retryCount >= 3)
2. **`recovery_escalated`** - RecoveryService escalated to user
3. **`pr:ci-failure`** - Persistent CI failures

### Process

1. `IssueCreationService` receives failure event
2. `TriageService.triage()` classifies severity and assigns priority
3. GitHub issue created via `gh` CLI (if `createGithubIssues` is true)
4. Discord notification posted to `#bugs-and-issues` channel
5. If `bugs.enabled` and priority meets `minLinearPriority` threshold:
   - `bug:linear-sync` event emitted
   - Listener in `index.ts` creates Linear issue in configured Bugs project

## Key Files

| File                                                 | Purpose                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/types/src/settings.ts`                         | `WorkflowSettings.bugs` type definition                            |
| `libs/types/src/event.ts`                            | `bug:linear-sync` event type                                       |
| `apps/server/src/services/issue-creation-service.ts` | Failure detection, GitHub issue creation, bug:linear-sync emission |
| `apps/server/src/services/triage-service.ts`         | Priority classification                                            |
| `apps/server/src/index.ts`                           | `bug:linear-sync` listener (Linear issue creation)                 |
| `apps/server/src/lib/settings-helpers.ts`            | `getWorkflowSettings()` with bugs merge                            |

## Related Documentation

- [Issue Management & Triage](./issue-management.md) — GitHub issue creation, triage priority, team routing
- [Agile Ceremony System](/agents/ceremonies) — Ceremony types and Discord delivery
