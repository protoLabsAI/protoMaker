---
name: plugin-management
emoji: 🔌
description: Claude Code plugin lifecycle — installation, updates, hooks format, and troubleshooting multiple versions.
metadata:
  author: agent
  created: 2026-02-12T16:55:39.543Z
  usageCount: 0
  successRate: 0
  tags: [plugin, mcp, hooks, configuration, troubleshooting]
  source: learned
---

# Plugin Management

The Automaker plugin (`packages/mcp-server/plugins/automaker/`) is the nerve center — ALL skills, commands, agents, and hooks live here. Never put operational skills in project-level `.claude/` dirs.

## Installation & Updates

```bash
# First install
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
claude plugin install protolabs

# Update (picks up new tools, commands)
claude plugin update protolabs

# Full reinstall (required after hooks.json changes)
claude plugin uninstall protolabs && claude plugin install protolabs

# Check installed versions
claude plugin list
```

## hooks.json Format

Plugin hooks require a `"hooks"` wrapper key at top level. Events go INSIDE the wrapper:

```json
{
  "hooks": {
    "SessionStart": [...],
    "PostToolUse": [...],
    "PreToolUse": [...]
  }
}
```

Use `${CLAUDE_PLUGIN_ROOT}` for paths to hook scripts within the plugin directory.

## When to Reinstall vs Update

| Change | Action |
|--------|--------|
| New MCP tool added | `claude plugin update protolabs` |
| Tool schema changed | `claude plugin update protolabs` |
| hooks.json modified | Full reinstall (uninstall + install) |
| New command/skill added | `claude plugin update protolabs` |
| Plugin .env changed | Restart Claude Code session |

**`update` alone doesn't pick up hooks changes.** Always do full reinstall for hooks.

## Multiple Plugin Versions

Having multiple plugin versions installed causes MCP tool failures (tools route to wrong version).

**Diagnosis:**
```bash
claude plugin list
```

If you see multiple automaker entries, uninstall all, then install latest:
```bash
claude plugin uninstall protolabs  # repeat if multiple
claude plugin install protolabs
```

## After Adding MCP Tools

The MCP server must be built for new tools to work:
```bash
npm run build:packages  # includes tsc for packages/mcp-server
```

Verify tools exist in `dist/`:
```bash
grep "tool_name" packages/mcp-server/dist/index.js
```

## Plugin .env

`packages/mcp-server/plugins/automaker/.env` — MCP plugin env vars:
- `AUTOMAKER_ROOT` — absolute path to the automaker repo clone (required, used by start-mcp.sh to locate the MCP server binary)
- `AUTOMAKER_API_KEY` — server auth key (must match the server's key)
- `AUTOMAKER_API_URL` — API base URL (default: `http://localhost:3008`)
- `GH_TOKEN` — GitHub token for PR operations
- `DISCORD_BOT_TOKEN` — Discord bot token (used by MCP)
- `CONTEXT7_API_KEY` — Context7 API key for documentation lookup
- `ENABLE_TOOL_SEARCH` — tool search mode (default: `auto:10`)

This is separate from the project root `.env` which the server uses.

## Temporary Skills

Some commands are temporary (onboarding, migration, one-time setup). These use `temporary: true` in their YAML frontmatter and are tracked in `packages/mcp-server/plugins/automaker/TEMP-SKILLS.md`. Check that file during cleanup passes and remove skills whose removal condition has been met.