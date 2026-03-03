# Linear integration

Linear is available as an MCP-tool-only integration. There are no sync pipelines, webhook handlers, or polling monitors. All Linear interaction is on-demand via MCP tools or server-side API calls.

## What is available

### MCP tools (`@linear/mcp-server`)

The Linear MCP server provides tools for reading and writing Linear issues, projects, teams, and comments. These tools are available to agents and the Claude plugin.

Common operations:

- `linear_getIssues` / `linear_getIssueById` / `linear_searchIssues` -- Query issues
- `linear_createIssue` / `linear_updateIssue` -- Manage issues
- `linear_createComment` -- Add comments
- `linear_getProjects` / `linear_createProject` -- Project management
- `linear_getTeams` / `linear_getWorkflowStates` -- Team and workflow queries

See the full tool list in [MCP tools reference](./mcp-tools-reference).

### LinearMCPClient (server-side API utility)

**File:** `apps/server/src/services/linear-mcp-client.ts`

A lightweight wrapper for making Linear GraphQL API calls from server-side code. Used by services that need to create or query Linear issues programmatically.

**Auth note:** Linear API keys (`lin_api_*`) must NOT use the `Bearer` prefix in the Authorization header. The client handles this automatically.

### LinearIssueChannel (escalation routing)

**File:** `apps/server/src/services/escalation-channels/linear-issue-channel.ts`

An escalation channel that creates Linear issues when critical signals are detected. The team ID is read from project settings (`integrations.linear.teamId`). See [Escalation routing](../agents/escalation-routing) for how channels work.

## Configuration

Set in `.automaker/settings.json` under `integrations.linear`:

```json
{
  "integrations": {
    "linear": {
      "teamId": "your-linear-team-id"
    }
  }
}
```

The `teamId` is used by `LinearIssueChannel` for escalation issue routing.

## Environment variables

| Variable         | Required | Description                                                |
| ---------------- | -------- | ---------------------------------------------------------- |
| `LINEAR_API_KEY` | No       | Personal API key (`lin_api_*`) for MCP tools and API calls |

## What was removed

The bidirectional sync pipeline (webhook handlers, status sync, approval bridges, polling monitors) was removed as part of the Pipeline Cohesion project. Linear is now exclusively accessed through MCP tools and direct API calls.

## Related

- [MCP tools reference](./mcp-tools-reference) -- Full MCP tool catalog including Linear tools
- [Escalation routing](../agents/escalation-routing) -- LinearIssueChannel for escalation
- [Linear deeplink](./linear-deeplink) -- Linear's AI coding tool deeplink feature
- [Archived: Linear sync](../archived/linear-sync) -- Previous bidirectional sync documentation
