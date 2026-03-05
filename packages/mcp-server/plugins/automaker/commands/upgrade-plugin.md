---
name: upgrade-plugin
description: Upgrade the protoLabs Claude Code plugin from an older version to current. Handles uninstall, reinstall, env migration, and verification.
argument-hint: (no arguments)
temporary: true
temporary-reason: Early tester onboarding — remove once all testers are on v0.15.x+
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# Plugin Upgrade

You are upgrading the user's protoLabs Claude Code plugin from an older version to the current version. This is a guided, safe migration.

## Important Context

- The OLD plugin directory (pre-rename) is `~/.claude/plugins/automaker/`
- The NEW plugin directory is `~/.claude/plugins/protolabs/`
- The plugin source lives in the repo at `packages/mcp-server/plugins/automaker/`
- The `.env` file in the plugin directory contains user secrets -- it MUST be preserved
- Hooks changes require a full uninstall/reinstall (update alone won't pick them up)
- The current version is read from `packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json`

## Upgrade Steps

### 1. Detect Current State

Run these diagnostics and report findings:

```bash
# Check if plugin is installed
ls -la ~/.claude/plugins/automaker/.claude-plugin/plugin.json 2>/dev/null

# Get installed version
cat ~/.claude/plugins/automaker/.claude-plugin/plugin.json 2>/dev/null | grep '"version"'

# Get target version from repo
cat packages/mcp-server/plugins/automaker/.claude-plugin/plugin.json | grep '"version"'

# Check for .env (must preserve)
ls -la ~/.claude/plugins/automaker/.env 2>/dev/null

# Check if multiple plugin versions exist
claude plugin list 2>/dev/null || echo "Cannot list plugins (CLI not available in this context)"

# Check if MCP server is built
ls packages/mcp-server/dist/index.js 2>/dev/null
```

Report what you find:

- **Installed version** vs **target version**
- Whether `.env` exists (and if AUTOMAKER_ROOT is set)
- Whether the MCP server binary is built
- Any signs of duplicate installations

### 2. Pre-flight Checks

Before proceeding, verify:

1. **MCP server is built**: If `packages/mcp-server/dist/index.js` doesn't exist, run `npm run build:packages` first
2. **Repo is on a recent branch**: Check `git log --oneline -1` to confirm they have the latest code
3. **No active agents**: Warn the user if any agents are running (upgrade will briefly disconnect MCP)

### 3. Backup .env

```bash
# Save existing .env before uninstall
if [ -f ~/.claude/plugins/automaker/.env ]; then
  cp ~/.claude/plugins/automaker/.env /tmp/automaker-plugin-env-backup
  echo "Backed up .env to /tmp/automaker-plugin-env-backup"
fi
```

### 4. Uninstall Old Version

```bash
# Remove old-name plugin (pre-rename)
claude plugin uninstall automaker 2>/dev/null || true

# Remove new-name plugin if already installed
claude plugin uninstall protolabs 2>/dev/null || true
```

If duplicates were detected in step 1, run uninstall again until `claude plugin list` shows no automaker or protolabs entries.

### 5. Reinstall from Marketplace

```bash
# Ensure marketplace is registered
claude plugin marketplace add "$(pwd)/packages/mcp-server/plugins"

# Install fresh (new name)
claude plugin install protolabs
```

### 6. Restore .env

```bash
# Restore backed-up .env to new plugin location
if [ -f /tmp/automaker-plugin-env-backup ]; then
  cp /tmp/automaker-plugin-env-backup ~/.claude/plugins/protolabs/.env
  echo "Restored .env from backup"
fi

# Verify AUTOMAKER_ROOT is set correctly
grep AUTOMAKER_ROOT ~/.claude/plugins/protolabs/.env
```

If no `.env` backup existed, create one:

```bash
cp ~/.claude/plugins/protolabs/.env.example ~/.claude/plugins/protolabs/.env
```

Then ask the user to fill in `AUTOMAKER_ROOT` (absolute path to their automaker clone) and `AUTOMAKER_API_KEY`.

### 7. Verify New Env Vars

Check if the `.env` has the newer optional vars. If missing, inform the user they can add them but don't require it:

- `CONTEXT7_API_KEY` -- optional, for documentation lookup
- `ENABLE_TOOL_SEARCH` -- optional, set in plugin.json env defaults

### 8. Verify Installation

```bash
# Confirm version
cat ~/.claude/plugins/protolabs/.claude-plugin/plugin.json | grep '"version"'

# Confirm hooks are present (key indicator of successful upgrade)
cat ~/.claude/plugins/protolabs/.claude-plugin/plugin.json | grep "post-edit-typecheck"
cat ~/.claude/plugins/protolabs/.claude-plugin/plugin.json | grep "evaluate-session"
```

### 9. Report

Summarize what changed:

- Old version -> New version
- Hooks added/updated
- Env vars preserved
- Any action items for the user

Tell the user they need to **restart Claude Code** for the upgrade to take effect. The MCP server will reconnect automatically on the next session.

## What Changed (for user context)

Key changes in the plugin overhaul:

- **Version synced** to monorepo (was 1.1.1, now tracks monorepo version)
- **Hooks synced**: post-edit-typecheck (TypeScript error checking on save) and evaluate-session (session quality tracking) now active
- **Orphaned files removed**: .orphaned_at
- **9 new commands**: /ship, /headsdown, /create-project, /calendar-assistant, /due-diligence, /deep-research, /sparc-prd, /improve-prompts, /upgrade-plugin
- **Tool count**: ~159 MCP tools (up from documented 135)

## Error Recovery

If anything goes wrong:

- The `.env` backup is at `/tmp/automaker-plugin-env-backup`
- The user can always do a clean install following `docs/integrations/claude-plugin.md`
- The old plugin source is in git history if needed
