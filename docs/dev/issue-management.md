# Issue Management & Triage

protoLabs includes an automated failure-to-issue pipeline that creates GitHub issues when features fail permanently, triages them by priority, and notifies the team via Discord.

## Architecture

```
Feature fails 3+ times
        │
        ▼
ReconciliationService ──► feature:permanently-blocked event
        │
        ▼
IssueCreationService ──► TriageService (classify)
        │                       │
        ▼                       ▼
  gh issue create         Priority + Team + Labels
        │
        ├──► Feature updated (githubIssueNumber, githubIssueUrl)
        ├──► issue:created event
        └──► Discord #bugs-and-issues notification
```

## Triggers

| Trigger                         | Source                | Event                         |
| ------------------------------- | --------------------- | ----------------------------- |
| Feature exceeds max retries (3) | ReconciliationService | `feature:permanently-blocked` |
| Recovery escalated to user      | RecoveryService       | `recovery_escalated`          |
| Persistent CI failure           | ReconciliationService | `pr:ci-failure`               |

## Priority Classification

TriageService assigns priority based on failure signals:

| Signal                 | Priority    | Label         |
| ---------------------- | ----------- | ------------- |
| Auth/quota failures    | P1 (Urgent) | `priority:p1` |
| Blocks 2+ features     | P1 (Urgent) | `priority:p1` |
| CI/test failures       | P2 (High)   | `priority:p2` |
| Single feature blocked | P3 (Normal) | `priority:p3` |
| Transient/tool errors  | P4 (Low)    | `priority:p4` |

## Team Routing

Issues are assigned to teams based on the files the feature modifies:

| File Pattern                      | Team     |
| --------------------------------- | -------- |
| `apps/ui/`, `.tsx`, `.css`        | frontend |
| `apps/server/`, `libs/`           | backend  |
| `.github/`, `docker*`, `scripts/` | devops   |
| Everything else                   | general  |

## GitHub Issue Format

Auto-created issues include:

- Feature ID, title, status, branch
- Retry count and failure category
- Triage priority and team assignment
- Last error message (truncated to 2000 chars)
- Failed CI checks (if applicable)
- Feature description (truncated to 1000 chars)

Labels applied: `auto-triage`, `priority:pN`, `team:X`, `failure:category`

## Discord Notifications

When `DISCORD_BUGS_CHANNEL_ID` is set, issue creation posts to `#bugs-and-issues`:

```
🔴 New Issue Created: Feature Title
Priority: P1: Urgent | Team: backend
Reason: P1: authentication failure affects all agent operations
GitHub: https://github.com/owner/repo/issues/123
```

## Manual Issue Creation

Create issues manually via the REST API:

```bash
curl -X POST http://localhost:3008/api/issues/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $AUTOMAKER_API_KEY" \
  -d '{"projectPath": "/path/to/project", "featureId": "feature-id"}'
```

## Configuration

| Environment Variable      | Description                             | Default    |
| ------------------------- | --------------------------------------- | ---------- |
| `DISCORD_BUGS_CHANNEL_ID` | Discord channel for issue notifications | (disabled) |

## Feature Fields

Issues are linked to features via two new fields:

```typescript
interface Feature {
  githubIssueNumber?: number; // GitHub issue number
  githubIssueUrl?: string; // GitHub issue URL
}
```

## Events

| Event                         | Payload                                                                      | Description                  |
| ----------------------------- | ---------------------------------------------------------------------------- | ---------------------------- |
| `feature:permanently-blocked` | `{ projectPath, featureId, retryCount, lastError, failureCategory }`         | Feature exceeded max retries |
| `issue:created`               | `{ featureId, projectPath, issueNumber, issueUrl, trigger, priority, team }` | GitHub issue created         |
| `issue:triage-completed`      | `{ featureId, projectPath, priority, team, labels, reason }`                 | Triage classification done   |

## Linear Bug Tracking

In addition to GitHub issues, failures can be automatically routed to a Linear "Bugs" project with priority-based severity gating.

When enabled, `IssueCreationService` emits a `bug:linear-sync` event after creating the GitHub issue. A listener in `index.ts` picks this up and creates a Linear issue via `LinearMCPClient`.

**Configuration:** Add `workflow.bugs` to `.automaker/settings.json`:

```json
{
  "workflow": {
    "bugs": {
      "enabled": true,
      "linearProjectId": "<linear-project-id>",
      "linearTeamId": "<linear-team-id>",
      "minLinearPriority": 3
    }
  }
}
```

Only bugs with priority at or above `minLinearPriority` (1=urgent through 4=low) are synced. Default threshold is 3 (medium), meaning P1/P2/P3 bugs create Linear issues while P4 (low) bugs only get GitHub issues.

See [Bug Tracking Pipeline](./bug-tracking.md) for full configuration reference and priority mapping.

## Future: Phase 3 (Bidirectional Sync)

Not yet implemented:

- GitHub `issues.opened` webhook -> create protoLabs feature
- Linear issue create -> create protoLabs feature
- Feature status changes -> update linked issues
