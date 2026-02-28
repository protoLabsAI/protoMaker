---
name: secrets-auth-rules
emoji: 🔐
description: Hard rules for secrets management and authentication. Two .env files only. Never curl the server directly. Never reference ~/.secrets/.
metadata:
  author: agent
  created: 2026-02-12T21:11:18.338Z
  usageCount: 0
  successRate: 0
  tags: [secrets, auth, env, security, discipline]
  source: learned
---

# Secrets & Auth Rules

## Two .env Files — The ONLY Sources of Truth

### 1. Project Root (`automaker/.env`)
Server env vars used by the Express backend:
- `PORT`, `HOST`, `HOSTNAME`
- `ANTHROPIC_API_KEY`
- `DISCORD_TOKEN` (server bot service)
- `LINEAR_API_TOKEN`
- `AUTOMAKER_API_KEY`
- `AUTOMAKER_AUTO_LOGIN=true` (dev only)

### 2. Plugin (`packages/mcp-server/plugins/automaker/.env`)
MCP plugin env vars used by Claude Code tools:
- `AUTOMAKER_ROOT` (path to project)
- `AUTOMAKER_API_KEY` (must match server)
- `DISCORD_BOT_TOKEN` (MCP Discord tools)
- `LINEAR_API_KEY`

## Hard Rules

### NEVER reference `~/.secrets/`
It does not exist. Was never a real pattern. If you see it in code, memory, or prompts — delete it.

### NEVER make direct API calls to the Automaker server
```bash
# WRONG — bypasses auth, will fail
curl http://localhost:3008/api/features
fetch('http://localhost:3008/api/features')

# RIGHT — MCP handles auth automatically
mcp__plugin_protolabs_studio__list_features({ projectPath: '...' })
```

The MCP plugin reads `AUTOMAKER_API_KEY` from its `.env` and injects it into requests. Direct calls skip this.

### NEVER commit .env files
Both `.env` files are gitignored. If `git status` shows them as modified/untracked, something is wrong.

### Token Separation
`DISCORD_TOKEN` (server) and `DISCORD_BOT_TOKEN` (plugin) may be the same token but are consumed differently:
- Server: `DiscordBotService.initialize()` calls `client.login(token)`
- Plugin: MCP Discord tools use REST API with token header

Similarly `LINEAR_API_TOKEN` (server) and `LINEAR_API_KEY` (plugin) — same key, different consumers.

## Auto-Login
`AUTOMAKER_AUTO_LOGIN=true` skips the login prompt in development. Disabled when `NODE_ENV=production`. Required for headless/automated operation.

## Adding New Secrets
1. Add to the appropriate `.env` file
2. Add to `apps/server/src/index.ts` or plugin config for consumption
3. Document in CLAUDE.md environment variables section
4. NEVER put secrets in `settings.json`, `feature.json`, or any git-tracked file