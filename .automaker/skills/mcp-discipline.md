---
name: mcp-discipline
emoji: 🔌
description: Always use MCP tools for Automaker API calls. Never use curl/fetch directly. MCP handles auth, routing, and error handling.
metadata:
  author: ava
  created: 2026-02-11T21:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [mcp, api, auth, discipline]
  source: learned
---

# MCP Tool Discipline

## The Rule

**NEVER make direct API calls (curl, fetch) to the Automaker server.** Always use MCP tools (`mcp__plugin_protolabs_studio__*`).

## Why

1. **Auth handled automatically** — MCP plugin reads `AUTOMAKER_API_KEY` from its `.env`. Direct calls require manually finding and passing the key.
2. **Error handling** — MCP tools parse responses and return structured results. curl gives raw JSON/HTML.
3. **Path resolution** — MCP tools resolve project paths consistently.
4. **API key rotation** — When the API key changes, MCP picks it up. Hardcoded curl commands break.

## Common MCP Tools

### Board Operations
```
mcp__plugin_protolabs_studio__get_board_summary({ projectPath })
mcp__plugin_protolabs_studio__list_features({ projectPath })
mcp__plugin_protolabs_studio__get_feature({ projectPath, featureId })
mcp__plugin_protolabs_studio__create_feature({ projectPath, title, description })
mcp__plugin_protolabs_studio__update_feature({ projectPath, featureId, updates })
mcp__plugin_protolabs_studio__move_feature({ projectPath, featureId, status })
```

### Agent Control
```
mcp__plugin_protolabs_studio__start_agent({ projectPath, featureId })
mcp__plugin_protolabs_studio__stop_agent({ projectPath, featureId })
mcp__plugin_protolabs_studio__list_running_agents()
mcp__plugin_protolabs_studio__get_agent_output({ projectPath, featureId })
mcp__plugin_protolabs_studio__send_message_to_agent({ projectPath, featureId, message })
```

### Auto-Mode
```
mcp__plugin_protolabs_studio__start_auto_mode({ projectPath, maxConcurrency })
mcp__plugin_protolabs_studio__stop_auto_mode({ projectPath })
mcp__plugin_protolabs_studio__get_auto_mode_status({ projectPath })
```

### Orchestration
```
mcp__plugin_protolabs_studio__set_feature_dependencies({ projectPath, featureId, dependencies })
mcp__plugin_protolabs_studio__get_dependency_graph({ projectPath })
mcp__plugin_protolabs_studio__get_execution_order({ projectPath })
```

### GitHub
```
mcp__plugin_protolabs_studio__merge_pr({ projectPath, prNumber })
mcp__plugin_protolabs_studio__check_pr_status({ projectPath, prNumber })
mcp__plugin_protolabs_studio__resolve_review_threads({ projectPath, prNumber })
```

## When MCP Tool Doesn't Exist

If there's no MCP tool for an operation, that's a **feature gap**. Create the tool — don't hack around it with direct API calls.

## Two .env Files

1. **Project root** `automaker/.env` — Dev server vars (PORT, ANTHROPIC_API_KEY, DISCORD_TOKEN, etc.)
2. **Plugin** `packages/mcp-server/plugins/automaker/.env` — MCP plugin vars (AUTOMAKER_API_KEY, DISCORD_BOT_TOKEN, etc.)

Never reference `~/.secrets/`. It doesn't exist.
