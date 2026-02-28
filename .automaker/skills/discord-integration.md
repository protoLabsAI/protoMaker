---
name: discord-integration
emoji: 💬
description: Discord bot integration patterns — login, channel IDs, message routing, and MCP timeout workarounds.
metadata:
  author: agent
  created: 2026-02-12T16:56:13.577Z
  usageCount: 0
  successRate: 0
  tags: [discord, integration, bot, routing, communication]
  source: learned
---

# Discord Integration

Patterns for working with the Automaker Discord bot, including gotchas and workarounds.

## Channel IDs

Channel IDs are configured per-instance via environment variables (DISCORD_CHANNEL_*) or UserProfile settings. Check your project's .env or settings for current values.

## Bot Tokens

Two separate tokens exist:
- `DISCORD_BOT_TOKEN` in plugin `.env` — Used by MCP tools for sending/reading messages
- `DISCORD_TOKEN` in project root `.env` — Used by the server's DiscordBotService

## MCP Login Timeout

The `discord_login` MCP tool times out because the bot ready event takes too long.

**Workaround:** The server's DiscordBotService handles bot lifecycle. Don't try to login via MCP. The bot connects automatically when the server starts.

For direct message sending without the bot service, use the MCP send tools which authenticate via the plugin `.env` token.

## Message Routing

### DM Routing (Event-Driven)
- `AgentDiscordRouter` handles DM routing based on `userRouting` in settings
- Primary user → Ava (configured via settings `userRouting`)
- Additional users → Routed per `userRouting` config
- No manual polling needed — routing is event-driven via `discord:dm:received`

### Slash Command Routing (Dynamic)
- Discord slash commands registered from Role Registry templates with `exposure.discord: true`
- Each command creates a public thread with the agent's name
- Access control via `allowedUsers` in template exposure config
- Thread messages auto-route to the assigned agent

### Channel Messages
- Bot listens to configured channels
- Messages from non-bot users emit `discord:message:detected`
- Router checks if message mentions or is directed at a specific agent

## Sending Messages

Always use MCP tools:
```
mcp__plugin_protolabs_discord__discord_send({ channelId, message })
mcp__plugin_protolabs_studio__send_discord_dm({ username, content })
```

For reading:
```
mcp__plugin_protolabs_discord__discord_read_messages({ channelId, limit })
mcp__plugin_protolabs_studio__read_discord_dms({ username, limit })
```

## Long Messages

Discord has a 2000-character limit. The bot service automatically splits long messages. When sending via MCP, split manually if content exceeds 2000 chars.