# Discord Communication Guide

This document defines the communication channels and rules for Discord integration with protoLabs, which serves as the real-time coordination layer for development teams.

## Server Setup

Create a Discord server for your protoLabs team. The channel structure below is the recommended layout.

## Channel Structure

### INFO

Server-level information and onboarding.

| Channel        | Purpose                                                    |
| -------------- | ---------------------------------------------------------- |
| #rules         | Server rules and code of conduct. Read-only.               |
| #announcements | Major updates, releases, milestones. Read-only for agents. |
| #introductions | New member introductions and role assignments.             |

### TEAM

Day-to-day team communication.

| Channel      | Purpose                                                           |
| ------------ | ----------------------------------------------------------------- |
| #standups    | Daily async standups. Post what you did, what's next, blockers.   |
| #general     | General team discussion. Default channel for non-specific topics. |
| #random      | Off-topic, fun, non-work discussion.                              |
| #suggestions | Feature ideas, process improvements, tooling suggestions.         |

### ENGINEERING

Domain-specific technical discussion. Each channel maps to a team role in the [agent hierarchy](/infra/architecture).

| Channel      | Purpose                                               | Team Role  |
| ------------ | ----------------------------------------------------- | ---------- |
| #frontend    | UI/UX, React, CSS, component architecture             | `frontend` |
| #backend     | API design, database, server, services                | `backend`  |
| #ai-ml       | Agent prompts, model config, AI features, fine-tuning | `ai-ml`    |
| #devops      | Docker, CI/CD, deployment, infrastructure             | `devops`   |
| #code-review | PR reviews, architecture discussions, code quality    | all teams  |
| #infra       | Infrastructure, networking, Docker, backups           | `devops`   |

### AUTOMAKER

protoLabs system activity and monitoring. Primarily bot/webhook-driven.

| Channel           | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| #agent-logs       | Agent start/stop/complete events, error summaries     |
| #pr-notifications | PR created/merged/reviewed notifications from GitHub  |
| #deployments      | Deployment status, release notes, environment changes |
| #bugs-and-issues  | Bug reports, system issues, incident tracking         |
| #alerts           | Health checks, CI failures, monitoring, error alerts  |
| #approvals        | Agent HITL requests, trust escalations, merge gates   |

### PROJECTS

Project coordination and team-specific workspaces. Used for cross-team planning and issue escalation.

| Channel           | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| #project-planning | Epic planning, milestone tracking, roadmap discussions     |
| #project-issues   | Cross-project issues, blockers, dependency conflicts       |
| #team-frontend    | Frontend team workspace - sprint items, questions, updates |
| #team-backend     | Backend team workspace - sprint items, questions, updates  |
| #team-ai-ml       | AI/ML team workspace - sprint items, questions, updates    |
| #team-devops      | DevOps team workspace - sprint items, questions, updates   |

### RESOURCES

Reference material and learning resources.

| Channel              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| #papers-and-research | Research papers, blog posts, technical writeups |
| #tools-and-links     | Useful tools, libraries, bookmarks              |
| #tutorials           | Tutorials, guides, how-tos, learning resources  |

### AI DISCUSSION

Open discussion about AI/ML topics (not project-specific).

| Channel             | Purpose                                       |
| ------------------- | --------------------------------------------- |
| #language-models    | LLM discussion, benchmarks, model comparisons |
| #prompt-engineering | Prompt techniques, templates, best practices  |
| #ai-news            | AI industry news, releases, announcements     |

### FEEDS

Automated content feeds from external sources. These channels are bot-driven, read-only for users, and provide a curated stream of industry knowledge. Users discuss articles by creating threads on individual messages.

| Channel           | Source                            | Bot       | Status |
| ----------------- | --------------------------------- | --------- | ------ |
| #feed-ai-research | ArXiv, HuggingFace, lab blogs     | MonitoRSS | Active |
| #feed-hackernews  | HackerNews best + front page      | MonitoRSS | Active |
| #feed-reddit      | r/LocalLLaMA, ML, programming     | MonitoRSS | Active |
| #feed-github      | GitHub trending repos by language | MonitoRSS | Active |
| #feed-youtube     | AI/ML content creators            | MonitoRSS | Active |
| #feed-engineering | Node, React, JS weekly            | MonitoRSS | Active |
| #feed-twitter     | AI researchers on X/Twitter       | TBD       | Setup  |

#### Feed Channel Permissions

Each feed channel should have these permission overrides:

| Permission               | @everyone | Bot Role |
| ------------------------ | --------- | -------- |
| View Channel             | Allow     | Allow    |
| Send Messages            | **Deny**  | Allow    |
| Create Public Threads    | Allow     | -        |
| Send Messages in Threads | Allow     | -        |

This ensures only bots post to the main channel. Users discuss articles by creating threads on specific messages. Discord auto-archives inactive threads after 24 hours.

#### MonitoRSS Setup

[MonitoRSS](https://monitorss.xyz) powers all RSS-based feed channels (paid plan, 75 feeds). Dashboard: https://monitorss.xyz/me

**Settings per feed:**

- Threads: Don't use (users create threads manually for discussion)
- Check interval: Default (~10 min)

**#feed-ai-research** (6 feeds):

| Feed Title      | RSS URL                                |
| --------------- | -------------------------------------- |
| ArXiv AI Papers | `https://arxiv.org/rss/cs.AI`          |
| ArXiv ML        | `https://arxiv.org/rss/cs.LG`          |
| ArXiv NLP       | `https://arxiv.org/rss/cs.CL`          |
| HuggingFace     | `https://papers.takara.ai/api/feed`    |
| OpenAI News     | `https://openai.com/news/rss.xml`      |
| Google DeepMind | `https://deepmind.google/blog/rss.xml` |

**#feed-hackernews** (2 feeds):

| Feed Title    | RSS URL                            |
| ------------- | ---------------------------------- |
| HN Best       | `https://hnrss.org/best`           |
| HN Front Page | `https://news.ycombinator.com/rss` |

**#feed-reddit** (3 feeds):

| Feed Title        | RSS URL                                             |
| ----------------- | --------------------------------------------------- |
| r/LocalLLaMA      | `https://www.reddit.com/r/LocalLLaMA/hot/.rss`      |
| r/MachineLearning | `https://www.reddit.com/r/MachineLearning/hot/.rss` |
| r/programming     | `https://www.reddit.com/r/programming/hot/.rss`     |

**#feed-github** (4 feeds):

| Feed Title | RSS URL                                                               |
| ---------- | --------------------------------------------------------------------- |
| Python     | `https://mshibanami.github.io/GitHubTrendingRSS/daily/python.xml`     |
| TypeScript | `https://mshibanami.github.io/GitHubTrendingRSS/daily/typescript.xml` |
| Go         | `https://mshibanami.github.io/GitHubTrendingRSS/daily/go.xml`         |
| Rust       | `https://mshibanami.github.io/GitHubTrendingRSS/daily/rust.xml`       |

**#feed-youtube** (8 feeds):

| Feed Title        | RSS URL                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| Sam Witteveen     | `https://www.youtube.com/feeds/videos.xml?channel_id=UC55ODQSvARtgSyc8ThfiepQ` |
| LangChain         | `https://www.youtube.com/feeds/videos.xml?channel_id=UCC-lyoTfSrcJzA1ab3APAgw` |
| NerdyRodent       | `https://www.youtube.com/feeds/videos.xml?channel_id=UC4-5v-f-xKnbi1yaAuRSi_w` |
| aiDotEngineer     | `https://www.youtube.com/feeds/videos.xml?channel_id=UCLKPca3kwwd-B59HNr-_lvA` |
| Yannic Kilcher    | `https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew` |
| Two Minute Papers | `https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg` |
| AI Explained      | `https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw` |
| 3Blue1Brown       | `https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw` |

**#feed-engineering** (3 feeds):

| Feed Title        | RSS URL                            |
| ----------------- | ---------------------------------- |
| Node Weekly       | `https://nodeweekly.com/rss`       |
| React Status      | `https://react.statuscode.com/rss` |
| JavaScript Weekly | `https://javascriptweekly.com/rss` |

#### Remaining Feed Channel (Setup Needed)

| Channel       | Recommended Bot                                                         | Setup Steps                                                                                 |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| #feed-twitter | [Readybot](https://readybot.io) or [TweetShift](https://tweetshift.com) | Invite bot → Configure accounts to follow (Anthropic, OpenAI, key researchers) → Set output |

#### Bot Summary

| Bot       | Feeds It Powers                                               | Dashboard             | Cost |
| --------- | ------------------------------------------------------------- | --------------------- | ---- |
| MonitoRSS | ai-research, hackernews, reddit, github, youtube, engineering | https://monitorss.xyz | Paid |
| TBD       | twitter                                                       | -                     | -    |

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

### protoLabs Channels

These channels are primarily automated:

- `#agent-logs` - Agents post status updates here via webhooks
- `#pr-notifications` - GitHub webhook integration for PR activity
- `#deployments` - CI/CD pipeline notifications
- `#bugs-and-issues` - Manual bug reports and automated error alerts

Human messages in protoLabs channels should be limited to:

- Responding to alerts
- Adding context to automated notifications
- Reporting manual observations

## Agent Communication Protocol

AI agents in the protoLabs hierarchy use Discord for status updates and coordination.

### Which agents post where

| Agent Role          | Primary Channel   | Also Posts To     |
| ------------------- | ----------------- | ----------------- |
| product-manager     | #project-planning | #announcements    |
| project-manager     | #project-planning | #project-issues   |
| engineering-manager | #code-review      | #team-\* channels |
| frontend team       | #team-frontend    | #frontend         |
| backend team        | #team-backend     | #backend          |
| ai-ml team          | #team-ai-ml       | #ai-ml            |
| devops team         | #team-devops      | #devops, #infra   |
| trust system        | #approvals        | #alerts           |
| health monitor      | #alerts           | #infra            |

### Message Format for Agents

Agents should use a consistent format:

```
**[Role] Status Update**
Feature: <feature name>
Status: <started|completed|blocked|failed>
Details: <brief description>
```

### Event-Driven Notifications

protoLabs emits events that can be routed to Discord channels:

| Event                  | Channel           | Message                                   |
| ---------------------- | ----------------- | ----------------------------------------- |
| `agent:started`        | #agent-logs       | Agent started working on feature X        |
| `agent:completed`      | #agent-logs       | Agent completed feature X                 |
| `agent:failed`         | #agent-logs       | Agent failed on feature X (error summary) |
| `pr:created`           | #pr-notifications | PR #N created for feature X               |
| `pr:merged`            | #pr-notifications | PR #N merged into main                    |
| `pr:review`            | #pr-notifications | CodeRabbit review on PR #N                |
| `deploy:started`       | #deployments      | Deployment started (version X)            |
| `deploy:completed`     | #deployments      | Deployment completed successfully         |
| `deploy:failed`        | #deployments      | Deployment failed (error summary)         |
| `epic:completed`       | #announcements    | Epic "X" completed (N features)           |
| `milestone:completed`  | #announcements    | Milestone "X" reached                     |
| `health:degraded`      | #alerts           | Service health check failed               |
| `health:recovered`     | #alerts           | Service recovered from degraded state     |
| `trust:approval`       | #approvals        | Agent requesting trust level promotion    |
| `policy:denied`        | #approvals        | High-risk action needs human approval     |
| `infra:backup`         | #infra            | Backup completed/failed                   |
| `infra:secret-rotated` | #infra            | Secret rotation completed                 |

## Server Configuration

The protoLabs server uses Discord for event routing, agent notifications, and the idea submission bot. All Discord IDs are configured via environment variables — no channel IDs are hardcoded.

### Required Environment Variables

Add these to your `.env` file (see `apps/server/.env.example`):

```bash
# Bot token — required for any Discord integration
DISCORD_TOKEN=your_bot_token

# Guild (server) ID
DISCORD_GUILD_ID=your_guild_id

# Channel IDs — the bot routes events to these channels
DISCORD_CHANNEL_SUGGESTIONS=       # #suggestions — !idea command and feature voting
DISCORD_CHANNEL_PROJECT_PLANNING=  # #project-planning — epic discussions
DISCORD_CHANNEL_AGENT_LOGS=        # #agent-logs — agent start/stop/complete
DISCORD_CHANNEL_CODE_REVIEW=       # #code-review — PR notifications
DISCORD_CHANNEL_INFRA=             # #infra — health checks, Ava Gateway heartbeat
```

### How to Get Channel IDs

1. Open Discord **User Settings > Advanced > Developer Mode** (toggle on)
2. Right-click any channel > **Copy Channel ID**
3. Right-click the server name > **Copy Server ID** (this is the Guild ID)

### Plugin Environment Variables

The MCP plugin uses a separate `.env` at `packages/mcp-server/plugins/automaker/.env`:

```bash
DISCORD_BOT_TOKEN=your_bot_token   # Same token as DISCORD_TOKEN above
```

If channel IDs are not configured, the bot service will start but skip routing to unconfigured channels. No errors are thrown — events are silently dropped.

## Integration Points

### Discord MCP

The Discord MCP server provides programmatic access to all channels. Available via Claude Code:

```bash
claude mcp add discord -s user -- docker run --rm -i \
  -e "DISCORD_TOKEN=<token>" \
  -e "DISCORD_GUILD_ID=<guild-id>" \
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
  "username": "protoLabs Bot"
}
```

Recommended webhooks:

| Channel           | Webhook Name     | Source                |
| ----------------- | ---------------- | --------------------- |
| #agent-logs       | protoLabs Agent  | protoLabs server      |
| #pr-notifications | GitHub           | GitHub webhook        |
| #deployments      | CI/CD            | GitHub Actions        |
| #ai-news          | AI News Feed     | RSS/Atom aggregator   |
| #alerts           | protoLabs Alerts | Health monitor        |
| #approvals        | Trust System     | Policy engine         |
| #infra            | DevOps Bot       | Backup/deploy scripts |

### Linear Integration

Linear issues map to Discord channels through the team hierarchy:

| Linear Team | Discord Channel | protoLabs Role |
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

- [Infrastructure](/infra/) - Deployment and system architecture
- [Claude Plugin](./claude-plugin) - MCP tools and plugin setup
