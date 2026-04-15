---
name: smoke-check
description: Fast MCP tool connectivity check. Tests 10 tools across protoLabs Studio and external integrations, outputs a PASS/FAIL matrix.
model: haiku
allowed-tools:
  - mcp__plugin_protolabs_studio__health_check
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__list_running_agents
  - mcp__plugin_protolabs_studio__list_worktrees
  - mcp__plugin_protolabs_studio__list_context_files
  - mcp__plugin_protolabs_studio__get_auto_mode_status
  - mcp__plugin_protolabs_studio__list_note_tabs
  - mcp__plugin_protolabs_studio__get_settings
  - mcp__plugin_protolabs_studio__list_events
  - mcp__plugin_protolabs_studio__send_discord_dm
  - mcp__plugin_protolabs_studio__read_discord_dms
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__delete_feature
  - mcp__plugin_protolabs_studio__update_feature
---

# Smoke Check

Run a fast connectivity check across all MCP tool categories. No retries, no analysis, no recommendations -- just the matrix.

## Instructions

1. Run ALL of the following tool calls **in parallel** (use a single message with multiple tool calls):

| #   | Category      | Tool Call              | Args                                                                                                                                                   |
| --- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Health        | `health_check`         | `{}`                                                                                                                                                   |
| 2   | Features      | `list_features`        | `{projectPath: "$CWD"}`                                                                                                                                |
| 3   | Agents        | `list_running_agents`  | `{projectPath: "$CWD"}`                                                                                                                                |
| 4   | Worktrees     | `list_worktrees`       | `{projectPath: "$CWD"}`                                                                                                                                |
| 5   | Context       | `list_context_files`   | `{projectPath: "$CWD"}`                                                                                                                                |
| 6   | Auto-Mode     | `get_auto_mode_status` | `{projectPath: "$CWD"}`                                                                                                                                |
| 7   | Notes         | `list_note_tabs`       | `{}`                                                                                                                                                   |
| 8   | Settings      | `get_settings`         | `{}`                                                                                                                                                   |
| 9   | Events        | `list_events`          | `{limit: 1}`                                                                                                                                           |
| 10  | Discord       | `read_discord_dms`     | `{userId: "test", limit: 1}`                                                                                                                           |
| 11  | Feature Write | `create_feature`       | `{projectPath: "$CWD", title: "[SMOKE-probe] connectivity test", description: "Synthetic probe — auto-deleted after smoke check.", category: "smoke"}` |

Replace `$CWD` with the actual current working directory path.

2. For each tool call, record:
   - **PASS** if the tool returned a response (even an empty list or expected error like "no messages")
   - **FAIL** if the tool threw a connection error, timeout, or was not found

3. **After step 1 completes**, clean up the synthetic probe feature from step 11:
   - If `create_feature` returned a feature ID, call `delete_feature({projectPath: "$CWD", featureId: "<returned-id>"})`.
   - If `delete_feature` fails, call `update_feature({projectPath: "$CWD", featureId: "<returned-id>", status: "done", statusChangeReason: "smoke-check artifact"})` as a fallback.
   - Record the cleanup result in the Notes column for row 11 (e.g., "created + deleted" or "created + marked done").

4. Output a single markdown table:

```
## Smoke Check Results

| # | Category | Status | Notes |
|---|----------|--------|-------|
| 1 | Health | PASS | Server v1.2.3 |
| 2 | Features | PASS | 12 features |
| ... | ... | ... | ... |
| 11 | Feature Write | PASS | created + deleted |

**Result: 9/11 PASS** | 2 failures: Discord (bot token not configured), ...
```

5. Keep the Notes column to 5 words or fewer per row. Use counts where available (e.g., "3 agents running", "0 worktrees").

6. Do NOT:
   - Retry failed tools
   - Analyze root causes
   - Suggest fixes
   - Add commentary beyond the table and summary line
