# Linear integration

protoMaker integrates with [Linear](https://linear.app) for bidirectional project management and AI agent interaction. @mention the agent on any issue to get context-aware analysis, or create a Linear project to trigger automated planning.

## Architecture

```
Linear                              protoMaker
┌──────────────────┐               ┌───────────────────────────┐
│ @mention agent   │──webhook────▶ │ LinearAgentRouter          │
│                  │               │   ↓ intelligent routing    │
│ Plan steps shown │◀──activity──│ acknowledge + plan display  │
│ Thoughts stream  │◀──activity──│ fetch context + route       │
│ Response appears │◀──activity──│ agent processes + responds   │
│                  │               │                             │
│ Reply to agent   │──webhook────▶│ Multi-turn follow-up        │
│                  │               │                             │
│ Create project   │──webhook────▶│ ProjectPlanningService      │
│ HITL checkpoints │◀──activity──│ LangGraph planning flow      │
│                  │               │                             │
│ Status changes   │◀──sync──────│ LinearSyncService            │
│ Issue approved   │──webhook────▶│ ApprovalHandler              │
└──────────────────┘               └───────────────────────────┘
```

### Integration modes

| Mode         | Direction     | Trigger                | Description                                        |
| ------------ | ------------- | ---------------------- | -------------------------------------------------- |
| **Agent**    | Bidirectional | @mention or delegation | AI agent responds via activities, multi-turn chat  |
| **Planning** | Bidirectional | Project created        | LangGraph flow with HITL checkpoints and documents |
| **Push**     | protoMaker →  | Feature events         | Creates issues, syncs status                       |
| **Pull**     | → protoMaker  | Webhooks               | Detects approvals, syncs priority changes          |

## Setup

### 1. Create a Linear OAuth application

1. Go to [Linear Settings > API > OAuth Applications](https://linear.app/settings/api/applications)
2. Click **New Application**
3. Fill in:
   - **Name**: `protoMaker` (this is the name users will see when they @mention the agent)
   - **Description**: `AI Development Studio agent`
   - **Redirect URI**: your callback URL (see below)
   - **Client credentials**: **Yes**
   - **Webhooks**: **Yes**
4. Copy the **Client ID** and **Client Secret**

**Redirect URI by environment:**

| Environment | Redirect URI                                               |
| ----------- | ---------------------------------------------------------- |
| Local dev   | `http://localhost:3008/api/linear/oauth/callback`          |
| Staging     | `https://your-staging-host:3008/api/linear/oauth/callback` |
| Via ngrok   | `https://your-id.ngrok-free.app/api/linear/oauth/callback` |

### 2. Configure webhooks

In the OAuth app settings (or via Linear Settings > API > Webhooks):

1. Set webhook URL: `https://your-server:3008/api/linear/webhook`
2. Copy the **Signing Secret**
3. Enable these event types:
   - **Agent Session Events** (required for @mention interaction)
   - **Issues** (required for status sync and approvals)
   - **Projects** (required for project planning flow)
   - **Comments** (optional, for comment-based workflows)

For **local development**, use ngrok to expose your server:

```bash
ngrok http 3008
# Use the ngrok HTTPS URL for both webhook URL and redirect URI
```

### 3. Set environment variables

Add to your `.env`:

```bash
# Linear OAuth (agent mode)
LINEAR_CLIENT_ID=your-client-id
LINEAR_CLIENT_SECRET=your-client-secret
LINEAR_REDIRECT_URI=http://localhost:3008/api/linear/oauth/callback
LINEAR_WEBHOOK_SECRET=your-webhook-signing-secret

# Linear API key (for MCP tools and sync — get from Linear Settings > API > Personal API Keys)
LINEAR_API_KEY=lin_api_...
```

The API key (`lin_api_*`) is used for outbound API calls (sync, MCP tools). The OAuth token is used for agent activities. Both are needed for full functionality.

### 4. Run the OAuth flow

Start the server, then authorize the agent in your workspace:

```bash
# Open in browser — redirects to Linear consent screen
open http://localhost:3008/api/linear/oauth/authorize?projectPath=/path/to/project

# Check connection status
curl http://localhost:3008/api/linear/oauth/status
```

After authorizing, the agent appears as a mentionable user in your Linear workspace. The OAuth token is stored in project settings automatically.

### 5. Enable sync (optional)

In `.automaker/settings.json`, configure per-project Linear settings:

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

## Agent interaction (@mention)

When a user @mentions the agent on a Linear issue, a session starts and the agent responds with activities — visible in Linear's agent sidebar.

### Session lifecycle

1. **Webhook fires** — Linear sends `AgentSession` created event
2. **Acknowledge** (within 10s) — agent confirms it received the request
3. **Plan display** — 4-step plan appears in Linear's session UI
4. **Fetch context** — enriched GraphQL query pulls issue details, relations, parent/children, project
5. **Route to specialist** — intelligent routing determines the best agent
6. **Research** — agent reads codebase files relevant to the issue
7. **Respond** — agent posts a detailed response as an activity

### What the user sees in Linear

The agent session UI shows:

- **Plan steps** with progress indicators (pending → in progress → completed)
- **Thoughts** as the agent works ("Routing to matt (label: frontend)")
- **Actions** ("Researching: Add dark mode toggle")
- **Response** with the final analysis/answer
- **Error** if something goes wrong

### Multi-turn conversations

Users can reply to the agent's response to continue the conversation. Each follow-up:

- Acknowledges within 10s
- Reconstructs full conversation history from prior activities
- Refreshes issue context (status/priority may have changed)
- Responds with awareness of the entire conversation

### Intelligent routing

The `LinearAgentRouter` uses a 5-tier routing system to pick the best agent:

| Tier | Signal           | Example                                     | Confidence |
| ---- | ---------------- | ------------------------------------------- | ---------- |
| 0    | Explicit agent   | Agent name matches a registered template    | 1.0        |
| 1    | Issue labels     | `frontend` label → Matt (frontend-engineer) | 1.0        |
| 2    | AI classifier    | Issue content analysis via Haiku            | 0.6-1.0    |
| 3    | Team name        | "Infrastructure" team → Frank (devops)      | 0.7        |
| 4    | Default fallback | No signals → pass through original agent    | —          |

**Label-to-role mapping:**

| Labels                              | Agent Role        |
| ----------------------------------- | ----------------- |
| `frontend`, `ui`, `react`           | frontend-engineer |
| `backend`, `api`, `server`          | backend-engineer  |
| `devops`, `infrastructure`, `ci/cd` | devops-engineer   |
| `marketing`, `gtm`, `content`       | gtm-specialist    |

**Team-to-role mapping:**

| Linear Team    | Default Role      |
| -------------- | ----------------- |
| Engineering    | backend-engineer  |
| Frontend       | frontend-engineer |
| Infrastructure | devops-engineer   |
| Marketing      | gtm-specialist    |

### Priority-based model selection

The agent automatically selects a Claude model based on issue priority:

| Linear Priority | Claude Model | Reasoning                         |
| --------------- | ------------ | --------------------------------- |
| Urgent (1)      | Opus         | Maximum quality for critical work |
| High (2)        | Opus         | Complex issues need deep analysis |
| Medium (3)      | Sonnet       | Good balance of speed and quality |
| Low (4)         | Haiku        | Fast responses for simple queries |
| None (0)        | Sonnet       | Default                           |

### Enriched issue context

The agent fetches rich context via GraphQL before processing:

- Issue title, description, state, priority, estimate, due date
- All labels and comments
- Parent issue (if this is a sub-issue)
- Child sub-issues with their states
- Related issues (blocking, blocked by, related)
- Project name and state
- Team information

This context is injected into both the system prompt and user prompt so the agent understands the full picture.

## Project planning flow

Creating a new project in Linear triggers an automated planning pipeline powered by LangGraph.

### How it works

1. **Linear project created** → webhook fires → `ProjectPlanningService` starts
2. **Agent session** created for the project
3. **LangGraph flow** executes step by step:
   - Research codebase
   - Generate planning document → HITL checkpoint (user approves/revises)
   - Deep research on approved plan
   - Generate SPARC PRD → HITL checkpoint
   - Plan milestones → HITL checkpoint
   - Create Linear issues from milestones
4. At each **HITL checkpoint**, the agent:
   - Creates/updates a Linear document with the artifact
   - Sends an elicitation with approve/revise/cancel options
   - Waits for the user to respond
5. User responses flow back through prompted webhooks to resume the flow

### HITL checkpoints

| Checkpoint   | Artifact            | What user reviews                       |
| ------------ | ------------------- | --------------------------------------- |
| Planning doc | Planning document   | Approach, scope, and technical strategy |
| PRD          | SPARC PRD           | Situation, Problem, Approach, Results   |
| Milestones   | Milestone breakdown | Phases, complexity, acceptance criteria |

At each checkpoint, users can:

- **Approve** — continue to next stage
- **Revise** — provide feedback, agent regenerates (max 3 revisions, then auto-approves)
- **Cancel** — abort the planning flow

## Bidirectional sync

### Status sync mapping

| protoMaker Status | Linear Status           | Direction           |
| ----------------- | ----------------------- | ------------------- |
| `backlog`         | `Backlog` / `Todo`      | Both                |
| `in_progress`     | `In Progress`           | Both                |
| `review`          | `In Review`             | protoMaker → Linear |
| `done`            | `Done`                  | Both                |
| `blocked`         | `Blocked` / `Cancelled` | protoMaker → Linear |

### Priority mapping

| Linear Priority | protoMaker Complexity | Claude Model |
| --------------- | --------------------- | ------------ |
| Urgent (1)      | `large`               | Opus         |
| High (2)        | `large`               | Opus         |
| Normal (3)      | `medium`              | Sonnet       |
| Low (4)         | `small`               | Haiku        |
| None (0)        | `medium`              | Sonnet       |

### Approval workflow

1. Product manager creates issue and moves to "Approved" state
2. Webhook fires → `LinearApprovalHandler` detects the state match
3. `ApprovalBridge` creates an epic feature on the protoMaker board
4. AI classifier suggests an agent role based on issue content
5. Auto-mode picks up features and assigns agents
6. Agent implements, creates PR, merges
7. `LinearSyncService` updates Linear issue status

## Settings reference

| Setting               | Type     | Default                              | Description                                              |
| --------------------- | -------- | ------------------------------------ | -------------------------------------------------------- |
| `enabled`             | boolean  | `false`                              | Enable Linear integration                                |
| `teamId`              | string   | —                                    | Linear team ID for issue creation                        |
| `projectId`           | string   | —                                    | Linear project to associate issues with                  |
| `syncOnFeatureCreate` | boolean  | `true`                               | Create Linear issue when feature is created              |
| `syncOnStatusChange`  | boolean  | `true`                               | Sync status changes to Linear                            |
| `commentOnCompletion` | boolean  | `true`                               | Add comment when agent completes work                    |
| `syncEnabled`         | boolean  | `false`                              | Enable bidirectional sync (Linear → protoMaker)          |
| `approvalStates`      | string[] | `["Approved", "Ready for Planning"]` | Workflow states that trigger approval pipeline           |
| `conflictResolution`  | string   | `"linear"`                           | Who wins on conflict: `linear`, `automaker`, or `manual` |
| `labelName`           | string   | —                                    | Custom label applied to synced issues                    |
| `priorityMapping`     | object   | —                                    | Map complexity to Linear priority (0-4)                  |

## Environment variables

| Variable                | Required | Description                                           |
| ----------------------- | -------- | ----------------------------------------------------- |
| `LINEAR_CLIENT_ID`      | Yes      | OAuth application client ID                           |
| `LINEAR_CLIENT_SECRET`  | Yes      | OAuth application client secret                       |
| `LINEAR_REDIRECT_URI`   | Yes      | OAuth callback URL                                    |
| `LINEAR_WEBHOOK_SECRET` | Yes      | Webhook signing secret for payload verification       |
| `LINEAR_API_KEY`        | No       | Personal API key (`lin_api_*`) for MCP tools and sync |
| `LINEAR_API_TOKEN`      | No       | Alternative to `LINEAR_API_KEY` (same purpose)        |

Token resolution order: OAuth agent token > settings API key > `LINEAR_API_KEY` env var > `LINEAR_API_TOKEN` env var.

**Auth note:** Linear API keys (`lin_api_*`) must NOT use the `Bearer` prefix in the Authorization header. OAuth tokens do use `Bearer`. The client handles this automatically.

## Key files

| File                                                   | Purpose                                     |
| ------------------------------------------------------ | ------------------------------------------- |
| `apps/server/src/routes/linear/webhook.ts`             | Webhook handler, event dispatch             |
| `apps/server/src/routes/linear/oauth.ts`               | OAuth authorize/callback/status/revoke      |
| `apps/server/src/services/linear-agent-router.ts`      | Intelligent routing, session handling       |
| `apps/server/src/services/linear-agent-service.ts`     | Activity protocol (thought/action/response) |
| `apps/server/src/services/linear-mcp-client.ts`        | GraphQL API client                          |
| `apps/server/src/services/linear-sync-service.ts`      | Bidirectional status/issue sync             |
| `apps/server/src/services/project-planning-service.ts` | LangGraph planning flow orchestrator        |
| `libs/flows/src/project-planning/`                     | LangGraph state machine and nodes           |

## Troubleshooting

### Agent not responding to @mentions

- Verify the OAuth flow completed (check `GET /api/linear/oauth/status`)
- Ensure **Agent Session Events** are enabled in webhook settings
- Check server logs: `grep "LinearAgentRouter" logs/`
- The agent must acknowledge within 10 seconds — network latency matters
- For local dev, confirm ngrok is running and the webhook URL is correct

### Webhook not firing

- Verify the webhook URL is reachable from Linear's servers
- Check `LINEAR_WEBHOOK_SECRET` matches between Linear settings and `.env`
- Linear sends a test ping on webhook creation — check it succeeded
- Review server logs: `grep "linear:webhook" logs/`

### "trying to use an API key as a Bearer token"

This error means the Authorization header has `Bearer lin_api_...`. Linear API keys must be sent without the Bearer prefix. The `linear-mcp-client.ts` handles this automatically — if you see this error, check for custom code overriding the auth header.

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

### Planning flow not starting on project creation

- Ensure **Projects** events are enabled in webhook settings
- Check that the server has the `ProjectPlanningService` started (logs: `grep "ProjectPlanningService" logs/`)
- The flow requires a project name and description — blank projects won't trigger planning
