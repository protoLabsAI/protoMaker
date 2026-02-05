# Discord Communication Guide

This document defines the communication channels and rules for the protoLabs Discord server, which serves as the real-time coordination layer for the Automaker development team.

## Server Overview

| Property    | Value               |
| ----------- | ------------------- |
| Server Name | protoLabs           |
| Server ID   | 1070606339363049492 |
| Created     | 2023-02-02          |
| Boost Tier  | Tier 1              |

## Channel Structure

### INFO

Server-level information and onboarding.

| Channel        | ID                  | Purpose                                                    |
| -------------- | ------------------- | ---------------------------------------------------------- |
| #rules         | 1469049462046593169 | Server rules and code of conduct. Read-only.               |
| #announcements | 1469049463967318027 | Major updates, releases, milestones. Read-only for agents. |
| #introductions | 1469049465078943970 | New member introductions and role assignments.             |

### TEAM

Day-to-day team communication.

| Channel      | ID                  | Purpose                                                           |
| ------------ | ------------------- | ----------------------------------------------------------------- |
| #standups    | 1469049467729608856 | Daily async standups. Post what you did, what's next, blockers.   |
| #general     | 1469049469504065700 | General team discussion. Default channel for non-specific topics. |
| #random      | 1469049471378919646 | Off-topic, fun, non-work discussion.                              |
| #suggestions | 1469049473756954645 | Feature ideas, process improvements, tooling suggestions.         |

### ENGINEERING

Domain-specific technical discussion. Each channel maps to a team role in the [agent hierarchy](../docs/infra/architecture.md).

| Channel      | ID                  | Purpose                                               | Team Role  |
| ------------ | ------------------- | ----------------------------------------------------- | ---------- |
| #frontend    | 1469049493407141951 | UI/UX, React, CSS, component architecture             | `frontend` |
| #backend     | 1469049496179572830 | API design, database, server, services                | `backend`  |
| #ai-ml       | 1469049498729971733 | Agent prompts, model config, AI features, fine-tuning | `ai-ml`    |
| #devops      | 1469049500487123086 | Docker, CI/CD, deployment, infrastructure             | `devops`   |
| #code-review | 1469049502550720896 | PR reviews, architecture discussions, code quality    | all teams  |

### AUTOMAKER

Automaker system activity and monitoring. Primarily bot/webhook-driven.

| Channel           | ID                  | Purpose                                               |
| ----------------- | ------------------- | ----------------------------------------------------- |
| #agent-logs       | 1469049504039702668 | Agent start/stop/complete events, error summaries     |
| #pr-notifications | 1469049506472661034 | PR created/merged/reviewed notifications from GitHub  |
| #deployments      | 1469049508909289752 | Deployment status, release notes, environment changes |
| #bugs-and-issues  | 1469049510599594223 | Bug reports, system issues, incident tracking         |

### PROJECTS

Project coordination and team-specific workspaces. Used for cross-team planning and issue escalation.

| Channel           | ID                  | Purpose                                                    |
| ----------------- | ------------------- | ---------------------------------------------------------- |
| #project-planning | 1469049525975908477 | Epic planning, milestone tracking, roadmap discussions     |
| #project-issues   | 1469049528773775381 | Cross-project issues, blockers, dependency conflicts       |
| #team-frontend    | 1469049532309311704 | Frontend team workspace - sprint items, questions, updates |
| #team-backend     | 1469049535203643668 | Backend team workspace - sprint items, questions, updates  |
| #team-ai-ml       | 1469049536344490110 | AI/ML team workspace - sprint items, questions, updates    |
| #team-devops      | 1469049537782874205 | DevOps team workspace - sprint items, questions, updates   |

### RESOURCES

Reference material and learning resources.

| Channel              | ID                  | Purpose                                         |
| -------------------- | ------------------- | ----------------------------------------------- |
| #papers-and-research | 1469049539498475640 | Research papers, blog posts, technical writeups |
| #tools-and-links     | 1469049541146968353 | Useful tools, libraries, bookmarks              |
| #tutorials           | 1469049542828757083 | Tutorials, guides, how-tos, learning resources  |

### AI DISCUSSION

Open discussion about AI/ML topics (not project-specific).

| Channel             | ID                  | Purpose                                       |
| ------------------- | ------------------- | --------------------------------------------- |
| #language-models    | 1469049560927043858 | LLM discussion, benchmarks, model comparisons |
| #prompt-engineering | 1469049563787563039 | Prompt techniques, templates, best practices  |
| #ai-news            | 1469049565448503357 | AI industry news, releases, announcements     |

### ARCHIVE

Empty category for preserving old discussions. Channels are moved here when they are no longer active but contain valuable history.

## Communication Rules

### General Rules

1. **Use the right channel.** Keep discussions in their designated channels. Off-topic messages go in #random.
2. **Be concise.** Prefer short, clear messages over walls of text. Use threads for extended discussions.
3. **Use threads.** Any discussion that exceeds 3-4 messages on a topic should be moved to a thread.
4. **No sensitive data.** Never post API keys, tokens, passwords, or credentials in any channel.
5. **Search first.** Before asking a question, search the channel history and #resources channels.

### Standup Format

Post in #standups daily (async, no specific time required):

```
**Yesterday:** Completed feature X, reviewed PR #123
**Today:** Working on feature Y, pair with @name on Z
**Blockers:** Waiting on API endpoint from backend team
```

### Engineering Channels

- Use the domain channel that matches your topic (#frontend, #backend, #ai-ml, #devops)
- Cross-cutting concerns go in #code-review
- Tag relevant team members with `@mention` when you need their input
- Post code snippets using markdown code blocks with language hints

### Project Channels

- `#project-planning` is for high-level roadmap and epic discussions
- `#project-issues` is for escalating blockers that affect multiple teams
- `#team-*` channels are team workspaces for day-to-day sprint coordination
- Keep project-specific discussions in the appropriate team channel

### Automaker Channels

These channels are primarily automated:

- `#agent-logs` - Agents post status updates here via webhooks
- `#pr-notifications` - GitHub webhook integration for PR activity
- `#deployments` - CI/CD pipeline notifications
- `#bugs-and-issues` - Manual bug reports and automated error alerts

Human messages in Automaker channels should be limited to:

- Responding to alerts
- Adding context to automated notifications
- Reporting manual observations

## Agent Communication Protocol

AI agents in the Automaker hierarchy use Discord for status updates and coordination.

### Which agents post where

| Agent Role          | Primary Channel   | Also Posts To     |
| ------------------- | ----------------- | ----------------- |
| product-manager     | #project-planning | #announcements    |
| project-manager     | #project-planning | #project-issues   |
| engineering-manager | #code-review      | #team-\* channels |
| frontend team       | #team-frontend    | #frontend         |
| backend team        | #team-backend     | #backend          |
| ai-ml team          | #team-ai-ml       | #ai-ml            |
| devops team         | #team-devops      | #devops           |

### Message Format for Agents

Agents should use a consistent format:

```
**[Role] Status Update**
Feature: <feature name>
Status: <started|completed|blocked|failed>
Details: <brief description>
```

### Event-Driven Notifications

Automaker emits events that can be routed to Discord channels:

| Event                 | Channel           | Message                                   |
| --------------------- | ----------------- | ----------------------------------------- |
| `agent:started`       | #agent-logs       | Agent started working on feature X        |
| `agent:completed`     | #agent-logs       | Agent completed feature X                 |
| `agent:failed`        | #agent-logs       | Agent failed on feature X (error summary) |
| `pr:created`          | #pr-notifications | PR #N created for feature X               |
| `pr:merged`           | #pr-notifications | PR #N merged into main                    |
| `pr:review`           | #pr-notifications | CodeRabbit review on PR #N                |
| `deploy:started`      | #deployments      | Deployment started (version X)            |
| `deploy:completed`    | #deployments      | Deployment completed successfully         |
| `deploy:failed`       | #deployments      | Deployment failed (error summary)         |
| `epic:completed`      | #announcements    | Epic "X" completed (N features)           |
| `milestone:completed` | #announcements    | Milestone "X" reached                     |

## Integration Points

### Discord MCP

The Discord MCP server provides programmatic access to all channels. Available via Claude Code:

```bash
claude mcp add discord -s user -- docker run --rm -i \
  -e "DISCORD_TOKEN=<token>" \
  -e "DISCORD_GUILD_ID=1070606339363049492" \
  discord-mcp:amd64
```

**Key tools:** `send_message`, `read_messages`, `create_webhook`, `send_webhook_message`

See [Discord MCP setup](https://github.com/SaseQ/discord-mcp) for details.

### Webhooks

Webhooks can be created per-channel for automated notifications:

```
POST https://discord.com/api/webhooks/{id}/{token}
Content-Type: application/json

{
  "content": "Message text",
  "username": "Automaker Bot"
}
```

Recommended webhooks:

| Channel           | Webhook Name    | Source              |
| ----------------- | --------------- | ------------------- |
| #agent-logs       | Automaker Agent | Automaker server    |
| #pr-notifications | GitHub          | GitHub webhook      |
| #deployments      | CI/CD           | GitHub Actions      |
| #ai-news          | AI News Feed    | RSS/Atom aggregator |

### Linear Integration

Linear issues map to Discord channels through the team hierarchy:

| Linear Team | Discord Channel | Automaker Role |
| ----------- | --------------- | -------------- |
| Frontend    | #team-frontend  | `frontend`     |
| Backend     | #team-backend   | `backend`      |
| AI/ML       | #team-ai-ml     | `ai-ml`        |
| DevOps      | #team-devops    | `devops`       |

Cross-team blockers identified in Linear triage are posted to #project-issues.

## Channel Lifecycle

### Creating New Channels

New channels should only be created when:

1. A new project team is formed (add `#team-<name>` to PROJECTS)
2. A new engineering domain is added (add to ENGINEERING)
3. A temporary channel is needed for a large initiative (use ARCHIVE when done)

### Archiving Channels

When a channel is no longer needed:

1. Move it to the ARCHIVE category
2. Set it to read-only
3. Post a final message explaining why it was archived
4. Do NOT delete channels with valuable discussion history

### Channel Naming Conventions

- Use lowercase kebab-case: `#my-channel-name`
- Team channels: `#team-<domain>`
- Project channels: `#project-<name>` (if project-specific channels are needed)
- Prefix automated channels with their source where helpful

## Related Documentation

- [Team Hierarchy Vision](../.automaker/context/team-hierarchy-vision.md) - Multi-agent hierarchy architecture
- [Infrastructure](./infra/README.md) - Deployment and system architecture
- [Claude Plugin](./claude-plugin.md) - MCP tools and plugin setup
