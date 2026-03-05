---
name: smoke-check
description: Fast MCP tool connectivity check. Tests 11 tools across protoLabs Studio and external integrations, outputs a PASS/FAIL matrix.
model: haiku
allowed-tools:
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__list_running_agents
  - mcp__plugin_protolabs_studio__list_worktrees
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_auto_mode_status
  - mcp__plugin_protolabs_studio__list_note_tabs
  - mcp__plugin_protolabs_studio__get_role_registry_status
  - mcp__plugin_protolabs_studio__get_settings
  - mcp__plugin_protolabs_studio__list_events
  - mcp__plugin_protolabs_studio__send_discord_dm
  - mcp__plugin_protolabs_studio__read_discord_dms
---

# Smoke Check

Run a fast connectivity check across all MCP tool categories. No retries, no analysis, no recommendations -- just the matrix.

## Instructions

1. Run ALL of the following tool calls **in parallel** (use a single message with multiple tool calls):

| #   | Category  | Tool Call                  | Args                         |
| --- | --------- | -------------------------- | ---------------------------- |
| 1   | Health    | `health_check`             | `{}`                         |
| 2   | Features  | `list_features`            | `{projectPath: "$CWD"}`      |
| 3   | Agents    | `list_running_agents`      | `{projectPath: "$CWD"}`      |
| 4   | Worktrees | `list_worktrees`           | `{projectPath: "$CWD"}`      |
| 5   | Context   | `list_context_files`       | `{projectPath: "$CWD"}`      |
| 6   | Auto-Mode | `get_auto_mode_status`     | `{projectPath: "$CWD"}`      |
| 7   | Notes     | `list_note_tabs`           | `{}`                         |
| 8   | Registry  | `get_role_registry_status` | `{}`                         |
| 9   | Settings  | `get_settings`             | `{}`                         |
| 10  | Events    | `list_events`              | `{limit: 1}`                 |
| 11  | Discord   | `read_discord_dms`         | `{userId: "test", limit: 1}` |

Replace `$CWD` with the actual current working directory path.

2. For each tool call, record:
   - **PASS** if the tool returned a response (even an empty list or expected error like "no messages")
   - **FAIL** if the tool threw a connection error, timeout, or was not found

3. Output a single markdown table:

```
## Smoke Check Results

| # | Category | Status | Notes |
|---|----------|--------|-------|
| 1 | Health | PASS | Server v1.2.3 |
| 2 | Features | PASS | 12 features |
| ... | ... | ... | ... |

**Result: 10/11 PASS** | 1 failure: Discord (bot token not configured)
```

4. Keep the Notes column to 5 words or fewer per row. Use counts where available (e.g., "3 agents running", "0 worktrees").

5. Do NOT:
   - Retry failed tools
   - Analyze root causes
   - Suggest fixes
   - Add commentary beyond the table and summary line
