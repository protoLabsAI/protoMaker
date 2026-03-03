# Integrations

Connect protoLabs to your development workflow. Each integration is either **Required** for core functionality or **Optional** for enhanced capabilities.

## Browser

Use protoLabs directly from Chrome without switching windows.

| Integration                              | Description                                                                                                                         | Status   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [Browser extension](./browser-extension) | Chrome extension for side panel chat, right-click context menu, GitHub PR integration, and a badge indicator showing server status. | Optional |

## AI Control Plane

Configure and control the AI agents that power your development studio.

| Integration                            | Description                                                                                                                          | Status   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| [Claude Code Plugin](./claude-plugin)  | Control protoLabs from the Claude Code CLI via MCP tools. Create features, start agents, manage the board, and orchestrate projects. | Required |
| [API Key Profiles](./api-key-profiles) | Manage multiple AI providers, switch between API keys, and configure model preferences per project.                                  | Required |

## Observability

Monitor agent performance, trace LLM calls, and manage prompt versions.

| Integration            | Description                                                                                                                                                         | Status   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [Langfuse](./langfuse) | LLM observability with trace inspection, cost tracking, and managed prompt versioning. Includes MCP tools for querying traces, scoring runs, and managing datasets. | Optional |

## Project Management

Linear integration for issue tracking and escalation routing.

| Integration        | Description                                                                                   | Status   |
| ------------------ | --------------------------------------------------------------------------------------------- | -------- |
| [Linear](./linear) | MCP-tool-only integration for issue management, plus escalation channel for critical signals. | Optional |

## Team Communication

Keep your team in the loop with real-time notifications and agent interaction.

| Integration          | Description                                                                                                                                         | Status   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [Discord](./discord) | Bot integration for event routing, status updates, and agent notifications. Agents can send updates, receive commands, and participate in channels. | Optional |

## Browser

Access protoLabs Studio from the browser toolbar with real-time agent monitoring.

| Integration                              | Description                                                                                                                        | Status   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [Browser Extension](./browser-extension) | Chrome/Firefox extension with side panel chat, context menu integration, GitHub page extraction, and real-time agent status badge. | Optional |

## Code Review and Git

Automate code review and manage the git workflow from branch to merge.

| Integration                         | Description                                                                                       | Status   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| [GitHub](./github)                  | Repository operations, PR creation, CI status checks, and auto-merge workflows.                   | Required |
| [CodeRabbit](https://coderabbit.ai) | Automated AI-powered PR review with inline code suggestions and severity-based thread management. | Optional |
