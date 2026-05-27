# MCP Tool Allowlists by Role

> Per-role tool allowlist mapping for the protoLabs MCP server.
> Generated from `.claude/commands/*.md` and `.claude/skills/*.md` allowed-tools declarations.
>
> **Total tools exposed:** 93 (across 19 tool modules)
> **Goal:** Fewer tools with stricter schemas to reduce agent misuse (tool gateway harness pattern).

## Tool Inventory Summary

| Module              | File                     | Count |
| ------------------- | ------------------------ | ----- |
| Feature Management  | `feature-tools.ts`       | 9     |
| Agent Control       | `agent-tools.ts`         | 5     |
| Queue Management    | `queue-tools.ts`         | 3     |
| Context & Skills    | `context-tools.ts`       | 4     |
| Orchestration       | `orchestration-tools.ts` | 6     |
| Project Lifecycle   | `project-tools.ts`       | 18    |
| GitHub Operations   | `git-tools.ts`           | 11    |
| Git Operations      | `git-ops-tools.ts`       | 2     |
| Observability       | `observability-tools.ts` | 5     |
| Integrations (HITL) | `integration-tools.ts`   | 4     |
| Workspace/Notes     | `workspace-tools.ts`     | 6     |
| Utilities           | `utility-tools.ts`       | 6     |
| Setup               | `setup-tools.ts`         | 6     |
| Scheduler           | `scheduler-tools.ts`     | 2     |
| Lead Engineer       | `lead-engineer-tools.ts` | 4     |
| Knowledge           | `knowledge-tools.ts`     | 4     |
| QA                  | `qa-tools.ts`            | 1     |
| Portfolio           | `portfolio-tools.ts`     | 2     |
| Cross-Repo          | `cross-repo-tools.ts`    | 3     |

## Per-Role Allowlists

### Quinn (Chief of Staff)

**Source:** `.claude/commands/quinn.md`

| Category        | Tools                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Observation** | `health_check`, `get_board_summary`, `list_features`, `get_feature`, `get_detailed_health`, `get_scheduler_status`, `get_auto_mode_status`, `list_running_agents` |
| **PR/GitHub**   | `check_pr_status`, `get_pr_feedback`, `get_pr_review_comments`, `list_worktrees`, `get_worktree_status`                                                           |
| **Diagnostics** | `get_server_logs`, `get_project_metrics`, `get_sitrep`, `list_actionable_items`                                                                                   |
| **Git Ops**     | `git_enhanced_status`, `git_file_details`                                                                                                                         |
| **QA**          | `run_qa_check`                                                                                                                                                    |
| **Settings**    | `get_settings`                                                                                                                                                    |
| **Cross-Repo**  | `get_cross_repo_dependencies`, `flag_cross_repo_dependency`, `resolve_cross_repo_dependency`                                                                      |

**Note:** `get_board_summary`, `get_detailed_health`, `list_actionable_items` are referenced but not implemented in MCP server.

### Sam (Dev Lead)

**Source:** `.claude/commands/sam.md`

| Category        | Tools                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Observation** | `health_check`, `get_board_summary`, `list_features`, `get_feature`                             |
| **Features**    | `create_feature`, `update_feature`, `move_feature`                                              |
| **Agents**      | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent` |
| **Context**     | `list_context_files`, `get_context_file`, `create_context_file`                                 |
| **PR/GitHub**   | `merge_pr`, `check_pr_status`, `resolve_review_threads`, `create_pr_from_worktree`              |
| **Git**         | `list_worktrees`, `get_worktree_status`                                                         |
| **Diagnostics** | `get_server_logs`, `get_detailed_health`                                                        |
| **Discord**     | `send_discord_dm`, `read_discord_dms`                                                           |
| **Settings**    | `get_settings`                                                                                  |

**Note:** `get_board_summary`, `move_feature`, `get_detailed_health`, `resolve_review_threads` (actual: `resolve_pr_threads`), `send_discord_dm`, `read_discord_dms` are referenced but not in MCP server.

### Kai (Product Manager)

**Source:** `.claude/commands/kai.md`

| Category          | Tools                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| **Observation**   | `health_check`, `get_board_summary`, `list_features`, `get_feature`                             |
| **Features**      | `create_feature`, `update_feature`, `move_feature`                                              |
| **Agents**        | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent` |
| **Context**       | `list_context_files`, `get_context_file`, `create_context_file`                                 |
| **Orchestration** | `set_feature_dependencies`, `get_dependency_graph`, `get_execution_order`                       |
| **Auto-Mode**     | `start_auto_mode`, `stop_auto_mode`, `get_auto_mode_status`                                     |
| **PR/GitHub**     | `check_pr_status`, `get_pr_feedback`                                                            |
| **Git**           | `list_worktrees`, `get_worktree_status`                                                         |
| **Diagnostics**   | `get_server_logs`, `get_detailed_health`                                                        |
| **Metrics**       | `get_project_metrics`, `get_capacity_metrics`, `get_forecast`                                   |
| **Settings**      | `get_settings`                                                                                  |

**Note:** `get_board_summary`, `move_feature`, `get_detailed_health` are referenced but not in MCP server.

### Matt (Infrastructure)

**Source:** `.claude/commands/matt.md`

| Category        | Tools                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Observation** | `health_check`, `get_board_summary`, `list_features`, `get_feature`                             |
| **Features**    | `create_feature`, `update_feature`, `move_feature`                                              |
| **Agents**      | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent` |
| **Context**     | `list_context_files`, `get_context_file`, `create_context_file`                                 |
| **PR/GitHub**   | `merge_pr`, `check_pr_status`, `resolve_review_threads`, `create_pr_from_worktree`              |
| **Git**         | `list_worktrees`, `get_worktree_status`                                                         |
| **Diagnostics** | `get_server_logs`, `get_detailed_health`                                                        |
| **Discord**     | `send_discord_dm`, `read_discord_dms`                                                           |
| **Settings**    | `get_settings`                                                                                  |

### Frank (QA/Reliability)

**Source:** `.claude/commands/frank.md`

| Category        | Tools                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Observation** | `health_check`, `get_board_summary`, `list_features`, `get_feature`                             |
| **Features**    | `create_feature`, `update_feature`, `move_feature`                                              |
| **Agents**      | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent` |
| **Context**     | `list_context_files`, `get_context_file`, `create_context_file`                                 |
| **PR/GitHub**   | `merge_pr`, `check_pr_status`, `resolve_review_threads`, `create_pr_from_worktree`              |
| **Git**         | `list_worktrees`, `get_worktree_status`                                                         |
| **Diagnostics** | `get_server_logs`, `get_detailed_health`                                                        |
| **Discord**     | `send_discord_dm`, `read_discord_dms`                                                           |
| **Settings**    | `get_settings`                                                                                  |

### Jon (Researcher)

**Source:** `.claude/commands/jon.md`

| Category        | Tools                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Observation** | `health_check`, `get_board_summary`, `list_features`, `get_feature`                             |
| **Features**    | `create_feature`, `update_feature`, `move_feature`                                              |
| **Agents**      | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent` |
| **Context**     | `list_context_files`, `get_context_file`, `create_context_file`                                 |
| **PR/GitHub**   | `check_pr_status`, `get_pr_feedback`                                                            |
| **Git**         | `list_worktrees`, `get_worktree_status`                                                         |
| **Diagnostics** | `get_server_logs`, `get_detailed_health`                                                        |
| **Settings**    | `get_settings`                                                                                  |

### Cindi (Content Manager)

**Source:** `.claude/commands/cindi.md`

| Category                | Tools                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Observation**         | `health_check`, `get_board_summary`, `list_features`, `get_feature`                             |
| **Features**            | `create_feature`, `update_feature`, `move_feature`                                              |
| **Agents**              | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `send_message_to_agent` |
| **Context**             | `list_context_files`, `get_context_file`, `create_context_file`                                 |
| **Content Pipeline**    | `create_content`, `get_content_status`, `list_content`, `review_content`, `export_content`      |
| **Antagonistic Review** | `execute_antagonistic_review`                                                                   |
| **Projects**            | `list_projects`, `get_project`, `get_project_spec`, `get_project_metrics`                       |
| **Discord**             | `send_discord_dm`, `read_discord_dms`                                                           |
| **Settings**            | `get_settings`                                                                                  |

**Note:** All content pipeline tools and `send_discord_dm`/`read_discord_dms` are referenced but not in MCP server.

### Skills

| Skill           | Source                              | Tools                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan            | `.claude/skills/plan.md`            | `list_features`, `get_project_spec`, `create_feature`, `update_feature`, `start_agent`, `stop_agent`, `get_agent_output`, `get_settings`, `get_context_file`, `get_sitrep`, `get_briefing`                                                                   |
| Plan Resume     | `.claude/skills/plan_resume.md`     | `list_features`, `get_project_spec`, `create_feature`, `update_feature`, `start_agent`, `get_agent_output`, `get_sitrep`, `get_briefing`                                                                                                                     |
| Researcher      | `.claude/skills/researcher.md`      | `list_features`, `get_feature`, `get_agent_output`, `list_running_agents`, `stop_agent`, `get_sitrep`, `get_briefing`, `get_settings`, `get_context_file`                                                                                                    |
| ProtoMaker CLI  | `.claude/skills/protomaker-cli.md`  | `health_check`, `get_sitrep`, `get_briefing`, `list_features`, `get_feature`, `create_feature`, `update_feature`, `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output`, `get_project_spec`, `list_projects`, `get_project`, `get_settings` |
| Board Health    | `.claude/skills/board_health.md`    | `list_features`, `create_feature`, `get_settings`                                                                                                                                                                                                            |
| Onboard Project | `.claude/skills/onboard_project.md` | `setup_lab`                                                                                                                                                                                                                                                  |

### Smoke Check

**Source:** `.claude/commands/smoke-check.md`

`health_check`, `list_features`, `list_running_agents`, `list_worktrees`, `list_context_files`, `get_auto_mode_status`, `list_note_tabs`, `get_settings`, `list_events`, `send_discord_dm`, `read_discord_dms`, `create_feature`, `delete_feature`, `update_feature`

**Note:** `list_events`, `send_discord_dm`, `read_discord_dms` are referenced but not in MCP server.

## Dead References (in Claude commands but not in MCP server)

| Tool Name                     | Referenced By                            | Status                                          |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------- |
| `get_board_summary`           | sam, kai, matt, frank, jon, quinn, cindi | Not implemented                                 |
| `move_feature`                | sam, kai, matt, frank, jon, cindi        | Not implemented                                 |
| `get_detailed_health`         | sam, kai, matt, frank, jon, quinn        | Not implemented                                 |
| `list_events`                 | smoke-check                              | Not implemented                                 |
| `send_discord_dm`             | sam, matt, frank, cindi, smoke-check     | Not implemented                                 |
| `read_discord_dms`            | sam, matt, frank, cindi, smoke-check     | Not implemented                                 |
| `list_actionable_items`       | quinn                                    | Not implemented                                 |
| `resolve_review_threads`      | sam, matt, frank                         | Should be `resolve_pr_threads`                  |
| `create_content`              | cindi                                    | Was in `content-tools.ts` (removed — dead code) |
| `get_content_status`          | cindi                                    | Was in `content-tools.ts` (removed — dead code) |
| `list_content`                | cindi                                    | Was in `content-tools.ts` (removed — dead code) |
| `review_content`              | cindi                                    | Was in `content-tools.ts` (removed — dead code) |
| `export_content`              | cindi                                    | Was in `content-tools.ts` (removed — dead code) |
| `execute_antagonistic_review` | cindi                                    | Was in `content-tools.ts` (removed — dead code) |

## Schema Tightening Applied

### Changes made to reduce agent misuse:

1. **`minLength: 1` on all `projectPath` fields** — prevents empty path submissions
2. **`minLength: 1` on all `featureId` fields** — prevents empty UUID submissions
3. **`minLength: 1` on all `title`, `description`, `message`, `content` fields** — prevents empty string submissions
4. **`type: 'integer'` on `priority`** — was `number`, now `integer` (matches enum values)
5. **`type: 'integer'` on `prNumber`** — was `number`, now `integer` with `minimum: 1`
6. **`type: 'integer'` on `maxLines`** — was `number`, now `integer` with `minimum: -1`
7. **`type: 'integer'` on `maxConcurrency`** — was `number`, now `integer` with `minimum: 1`
8. **`type: 'integer'` on `ttlSeconds`** — was `number`, now `integer` with `minimum: 1`
9. **`type: 'integer'` on `limit`** — was `number`, now `integer` with `minimum: 1`, `maximum: 200`
10. **`pattern: '^\d{4}-\d{2}-\d{2}$'` on `dueDate`** — enforces ISO date format
11. **`pattern: '^[0-9a-fA-F-]{1,}$'` on `featureId`** — enforces UUID-like format
12. **`minItems: 1` on arrays** — `dependencies`, `milestones`, `steps`, etc.
13. **`minLength: 1` on array items** — `dependencies[]`, `milestones[].slug`, etc.

### Tools Removed

| Tool                         | Reason                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `content-tools.ts` (6 tools) | Dead code — never imported in `index.ts`, never served by MCP server |

## Recommendations

1. **Implement or remove dead references** — 14 tool names are referenced in Claude commands but don't exist in the MCP server. Either implement them or update the command files.
2. **Add role-based tool filtering** — Currently all 93 tools are exposed to all roles. Consider implementing role-based filtering at the MCP server level.
3. **Consolidate `git-tools.ts` and `git-ops-tools.ts`** — Both deal with git operations; consider merging.
4. **Consider removing low-usage tools** — Tools like `knowledge_*`, `portfolio_*`, `cross_repo_*` have no Claude command references and may be unused.
