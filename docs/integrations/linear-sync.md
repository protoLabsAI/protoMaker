# Linear Integration

protoMaker integrates with [Linear](https://linear.app) for bidirectional project management sync. Approved Linear issues flow into the protoMaker pipeline for AI agent execution, and status changes sync back to Linear.

## Architecture

```
Linear                          protoMaker
┌─────────────────┐            ┌──────────────────────┐
│ Issue approved   │──webhook──▶│ ApprovalHandler       │
│                  │            │   ↓                   │
│                  │            │ ApprovalBridge         │
│                  │            │   ↓                   │
│                  │            │ ProjM decomposition    │
│                  │            │   ↓                   │
│                  │◀──sync────│ Agent execution         │
│ Status updated   │            │   ↓                   │
│ Comment added    │◀──sync────│ PR merged → done        │
└─────────────────┘            └──────────────────────┘
```

### Three integration modes

| Mode      | Direction          | Trigger         | Description                                      |
| --------- | ------------------ | --------------- | ------------------------------------------------ |
| **Push**  | protoMaker → Linear | Feature events  | Creates issues, syncs status, adds comments      |
| **Pull**  | Linear → protoMaker | Webhooks        | Detects approvals, syncs status/priority changes |
| **Agent** | Bidirectional      | OAuth actor=app | protoMaker appears as an agent in Linear          |

## Setup

### 1. Create a Linear OAuth Application

1. Go to [Linear Settings > API > OAuth Applications](https://linear.app/settings/api/applications)
2. Click **New Application**
3. Fill in:
   - **Name**: `protoMaker`
   - **Description**: `AI Development Studio agent`
   - **Redirect URI**: `http://localhost:3008/api/linear/oauth/callback`
   - **Actor**: Select **Application** (creates a dedicated agent user)
4. Copy the **Client ID** and **Client Secret**

### 2. Configure Environment Variables

Add to your server `.env`:

```bash
# Linear OAuth (agent mode)
LINEAR_CLIENT_ID=your-client-id
LINEAR_CLIENT_SECRET=your-client-secret
LINEAR_REDIRECT_URI=http://localhost:3008/api/linear/oauth/callback

# Linear webhook verification
LINEAR_WEBHOOK_SECRET=your-webhook-secret
```

For the MCP plugin, add to `packages/mcp-server/plugins/automaker/.env`:

```bash
LINEAR_API_KEY=lin_api_...  # Personal API key for MCP tools
```

### 3. Run the OAuth Flow

1. Start the protoMaker server
2. Navigate to **Settings > Integrations > Linear** in the UI
3. Click **Connect to Linear**
4. Authorize the application in Linear
5. The token is stored in project settings automatically

Or via API:

```bash
# Start OAuth flow
open http://localhost:3008/api/linear/oauth/authorize

# Check status
curl http://localhost:3008/api/linear/oauth/status
```

### 4. Configure Webhooks

1. Go to [Linear Settings > API > Webhooks](https://linear.app/settings/api/webhooks)
2. Click **New Webhook**
3. Configure:
   - **URL**: `http://your-server:3008/api/linear/webhook`
   - **Secret**: Same value as `LINEAR_WEBHOOK_SECRET`
   - **Events**: Enable all Issue events and Project events
4. Save and verify the test ping succeeds

> **Note**: For local development, use [ngrok](https://ngrok.com) or similar to expose your local server: `ngrok http 3008`

### 5. Enable Sync in Project Settings

In the protoMaker UI or via API, configure per-project Linear settings:

```json
{
  "integrations": {
    "linear": {
      "enabled": true,
      "teamId": "your-linear-team-id",
      "syncOnFeatureCreate": true,
      "syncOnStatusChange": true,
      "commentOnCompletion": true,
      "syncEnabled": true,
      "approvalStates": ["Approved", "Ready for Planning"],
      "conflictResolution": "linear"
    }
  }
}
```

## Settings Reference

| Setting               | Type     | Default                              | Description                                              |
| --------------------- | -------- | ------------------------------------ | -------------------------------------------------------- |
| `enabled`             | boolean  | `false`                              | Enable Linear integration                                |
| `teamId`              | string   | —                                    | Linear team ID for issue creation                        |
| `projectId`           | string   | —                                    | Linear project to associate issues with                  |
| `syncOnFeatureCreate` | boolean  | `true`                               | Create Linear issue when feature is created              |
| `syncOnStatusChange`  | boolean  | `true`                               | Sync status changes to Linear                            |
| `commentOnCompletion` | boolean  | `true`                               | Add comment when agent completes work                    |
| `syncEnabled`         | boolean  | `false`                              | Enable bidirectional sync (Linear → protoMaker)           |
| `approvalStates`      | string[] | `["Approved", "Ready for Planning"]` | Workflow states that trigger approval pipeline           |
| `conflictResolution`  | string   | `"linear"`                           | Who wins on conflict: `linear`, `automaker`, or `manual` |
| `labelName`           | string   | —                                    | Custom label applied to synced issues                    |
| `priorityMapping`     | object   | —                                    | Map complexity to Linear priority (0-4)                  |

## Workflow Examples

### Approval → Decomposition → Execution

1. **Product manager** creates issue in Linear and moves to "Approved" state
2. **Webhook** fires → `LinearApprovalHandler` detects the state match
3. **ApprovalBridge** creates an epic feature on the protoMaker board
4. **AI Classifier** suggests an agent role based on issue content
5. **ProjM** receives `authority:pm-review-approved` event and decomposes into sub-features
6. **Auto-mode** picks up features and assigns agents
7. **Agent** implements, creates PR, merges
8. **LinearSyncService** updates Linear issue status to match

### Status Sync Mapping

| protoMaker Status | Linear Status           | Direction          |
| ---------------- | ----------------------- | ------------------ |
| `backlog`        | `Backlog` / `Todo`      | Both               |
| `in_progress`    | `In Progress`           | Both               |
| `review`         | `In Review`             | protoMaker → Linear |
| `done`           | `Done`                  | Both               |
| `blocked`        | `Blocked` / `Cancelled` | protoMaker → Linear |

### Priority Mapping

| Linear Priority | protoMaker Complexity |
| --------------- | -------------------- |
| Urgent (1)      | `large`              |
| High (2)        | `large`              |
| Normal (3)      | `medium`             |
| Low (4)         | `small`              |
| None (0)        | `medium`             |

## Agent Routing

When Linear issues are assigned to the protoMaker agent (via OAuth actor=app), the `LinearAgentRouter` determines which specialized agent handles the work:

1. **Explicit match** — Issue mentions a registered agent name (e.g., "assign to Matt")
2. **Label matching** — Issue labels map to roles (e.g., `frontend` → frontend-engineer)
3. **AI classification** — Haiku classifies the issue content into a role
4. **Team fallback** — Linear team name maps to a default role

See the [Agent Templates API](/integrations/claude-plugin#agent-templates) for registering custom agents.

## Troubleshooting

### Webhook not firing

- Verify the webhook URL is reachable from Linear's servers
- Check `LINEAR_WEBHOOK_SECRET` matches between Linear settings and `.env`
- Review server logs: `grep "linear:webhook" logs/`
- For local dev, ensure ngrok/tunnel is running

### OAuth token expired

- Tokens auto-refresh via the refresh token
- If refresh fails, re-run the OAuth flow from Settings > Integrations > Linear
- Check `linear.tokenExpiresAt` in project settings

### Sync conflicts

When the same field is modified in both Linear and protoMaker simultaneously:

- **`conflictResolution: "linear"`** — Linear's value wins (default, safest)
- **`conflictResolution: "automaker"`** — protoMaker's value wins
- **`conflictResolution: "manual"`** — Neither side overwrites; requires manual resolution

Loop prevention: Every sync operation sets a `syncedFromLinear` / `syncedFromprotoMaker` flag. The other side checks this flag and skips updates that originated from itself.

### Status not syncing

- Verify `syncEnabled: true` in project settings
- Check that the Linear workflow state names match expected values
- The sync service normalizes common state names (e.g., "In Progress", "InProgress", "in_progress")

### Missing Linear issue for feature

- Ensure `syncOnFeatureCreate: true`
- Verify `teamId` is set in project settings
- Check server logs for `linear:sync` errors
