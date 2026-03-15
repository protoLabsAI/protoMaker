# Channel Handlers

Channel handlers route HITL form requests and gate approvals to the correct delivery channel — either the in-app UI or a GitHub issue comment thread.

## Architecture

```
HITLFormService.create()
        │
        │ form has replyChannel?
        ▼
  ChannelRouter.getHandler(feature)
        │
        ├── feature.githubIssueNumber exists?
        │       ▼
        │   GitHubChannelHandler
        │       - posts gate-hold comment on GitHub issue
        │       - listens for /approve or /reject in issue_comment events
        │       - resolveGate() called to unblock the pipeline
        │
        └── no GitHub issue
                ▼
            UIChannelHandler (no-op)
                - logs the skip; UI renders the HITL form dialog normally
```

The channel router is wired into `HITLFormService` via `setChannelRouter()` at startup (see `channel-handlers.module.ts`).

## Handlers

### `GitHubChannelHandler`

Delivers HITL form requests and gate holds as GitHub issue comments.

**Responsibilities:**

- `requestApproval()` — posts a comment on the originating GitHub issue stating the pipeline is paused and waiting for approval
- `sendHITLForm()` — posts the HITL form contents as a formatted issue comment
- `cancelPending()` — posts a cancellation comment and removes the pending approval record

**Pending approval tracking:** Approvals are tracked in-memory keyed by `featureId`. When a subsequent `issue_comment` webhook event contains `/approve` or `/reject`, `resolveGate()` is called to advance or reject the pipeline gate.

**Fallback:** If `githubIssueNumber` is missing on the feature, `GitHubChannelHandler` delegates to `UIChannelHandler` automatically.

### `UIChannelHandler`

A no-op handler used when no GitHub issue is associated with the feature. It logs the skip and relies on the `hitl:form-requested` WebSocket event to surface the form in the in-app HITL dialog.

## Interface

Both handlers implement the `ChannelHandler` interface:

```typescript
interface ChannelHandler {
  requestApproval(params: ApprovalParams): Promise<void>;
  sendHITLForm(params: HITLFormParams): Promise<void>;
  cancelPending(params: CancelParams): Promise<void>;
}
```

## Module wiring

`channel-handlers.module.ts` wires the `ChannelRouter` into `HITLFormService` at startup:

```typescript
export function register(container: ServiceContainer): void {
  container.hitlFormService.setChannelRouter(container.channelRouter);
}
```

This must run before any pipeline or HITL form service operations.

## Key Files

| File                                                                   | Role                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/server/src/services/channel-handlers/github-channel-handler.ts`  | `GitHubChannelHandler`, `UIChannelHandler`, `ChannelHandler` interface |
| `apps/server/src/services/channel-handlers/channel-handlers.module.ts` | Startup wiring: sets `channelRouter` on `HITLFormService`              |
| `apps/server/src/services/channel-router.ts`                           | Selects the appropriate handler per feature                            |

## See Also

- [Actionable Items and HITL Forms](./actionable-items.md) — feature flag requirement and form lifecycle
- [Lead Engineer Pipeline](../dev/lead-engineer-pipeline.md) — ESCALATE phase creates HITL forms on non-retryable failures
