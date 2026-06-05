# MCP Tools Reference

Complete catalog of **100 MCP tools** exposed by the protoLabs server. See `packages/mcp-server/src/tools/` for the full definitions.

For installation and configuration, see [Claude Plugin Setup](../integrations/claude-plugin.md). For commands and examples, see [Plugin Commands](../integrations/plugin-commands.md).

> This page is generated from `packages/mcp-server/src/tools/*.ts`. Regenerate with `node scripts/gen-mcp-tools-doc.mjs`.

## Feature Management (10 tools)

| Tool                          | Description                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_features`               | List all features in a project. Returns features organized by status (backlog, in-progress, review, done).                                   |
| `get_feature`                 | Get detailed information about a specific feature including its description, status, and agent output.                                       |
| `get_run_telemetry`           | Self-diagnose a feature's run: returns a structured digest of its execution history (attempts, failures, repeated error, cost, turns, rem... |
| `create_feature`              | Create a new feature on the Kanban board. Features start in the backlog by default.                                                          |
| `update_feature`              | Update a feature's properties. Can be used to change status, title, description, or move between columns.                                    |
| `delete_feature`              | Delete a feature from the board. This is a destructive action.                                                                               |
| `update_feature_git_settings` | Update git workflow settings for a specific feature. Override global git workflow settings (auto-commit, auto-push, auto-PR, auto-merge)...  |
| `rollback_feature`            | Rollback a deployed feature by reverting its merge commit. Finds the merge commit from the feature's prNumber, runs git revert -m 1, and...  |
| `list_workflows`              | List all available workflows for a project. Returns built-in workflows (standard, read-only, content, audit, research, tech-debt-scan, po... |
| `reconcile_feature_with_pr`   | Manually reconcile a feature with a merged GitHub PR. Use this when a feature shipped via an out-of-band PR (cherry-pick, re-cut branch,...  |

## Agent Control (5 tools)

| Tool                    | Description                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `start_agent`           | Start an AI agent to work on a feature. The agent will create a git worktree and begin implementation. |
| `stop_agent`            | Stop a running agent.                                                                                  |
| `list_running_agents`   | List all currently running agents across all projects.                                                 |
| `get_agent_output`      | Get the output/log from an agent's execution on a feature. Useful for reviewing what the agent did.    |
| `send_message_to_agent` | Send a message to a running agent. Use this to provide clarification or additional instructions.       |

## Queue Management (3 tools)

| Tool            | Description                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `queue_feature` | Add a feature to the agent queue for processing. Features in queue are automatically picked up. |
| `list_queue`    | List all features currently in the agent queue.                                                 |
| `clear_queue`   | Clear all features from the agent queue. This is a destructive action.                          |

## Context & Skills (4 tools)

| Tool                  | Description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `list_context_files`  | List all context files in a project's .automaker/context/ directory. These files are injected into agent prompts. |
| `get_context_file`    | Read the contents of a context file.                                                                              |
| `create_context_file` | Create a new context file that will be injected into all agent prompts for this project.                          |
| `delete_context_file` | Delete a context file.                                                                                            |

## Orchestration (8 tools)

| Tool                       | Description                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_feature_dependencies` | Set dependencies for a feature. The feature will not start until all dependencies are marked Done.                                           |
| `get_dependency_graph`     | Get the dependency graph for all features in a project. Shows which features block others. Pass an optional featureId to get detailed dep... |
| `start_auto_mode`          | Start auto-mode for a project. Agents will automatically pick up and process backlog features respecting dependencies.                       |
| `stop_auto_mode`           | Stop auto-mode for a project.                                                                                                                |
| `get_auto_mode_status`     | Check if auto-mode is running for a project and get its status.                                                                              |
| `pause_project`            | Pause an app/project (keyed by projectPath). Records the app as paused, marks every non-terminal project slug as paused for board visibil... |
| `resume_project`           | Resume a paused app/project (keyed by projectPath). Removes it from the pause registry and restores each paused slug's prior status. Does... |
| `get_execution_order`      | Get the resolved execution order for features based on dependencies. Useful for planning.                                                    |

## Project Orchestration (17 tools)

| Tool                      | Description                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_project_spec`        | Get the project specification from .automaker/spec.md. This provides architectural context to agents.                                        |
| `update_project_spec`     | Update the project specification. This is shown to agents for architectural context.                                                         |
| `list_projects`           | List all project plans in a project. Returns project slugs that can be used with get_project.                                                |
| `get_project`             | Get detailed information about a project plan including milestones, phases, and PRD.                                                         |
| `create_project`          | Create a new project plan with milestones and phases. This scaffolds the project structure in .automaker/projects/.                          |
| `update_project`          | Update a project plan. Can update title, goal, status, or PRD.                                                                               |
| `delete_project`          | Delete a project plan and all its files. This is a destructive action.                                                                       |
| `archive_project`         | Archive a completed project. Slims project.json to mapping data only (slug, title, milestone/phase IDs) and deletes .md files and milesto... |
| `create_project_features` | Create Kanban board features from a project plan. Converts phases to features with optional epic grouping.                                   |
| `initiate_project`        | Start a new project lifecycle. Creates a local project cache with the idea description. Returns duplicates if found (caller should confir... |
| `generate_project_prd`    | Check if a PRD exists for a project. If not, suggests generating one via the /plan-project skill or create_project tool. Returns existing... |
| `save_project_milestones` | Save structured milestone/phase data to a project. This bridges the gap between PM agent PRD output and approve_project_prd. Call this af... |
| `approve_project_prd`     | Approve the PRD and create board features from project milestones. Call after the project has a PRD and milestones defined.                  |
| `launch_project`          | Launch a project and start auto-mode. Requires features to exist in backlog (call approve_project_prd first).                                |
| `get_lifecycle_status`    | Get the current lifecycle phase and next actions for a project. Reads local board state to determine where the project is in the pipeline.   |
| `assign_project`          | Assign a project to an instance. Writes assignedTo, assignedAt, and assignedBy fields to the project.                                        |
| `unassign_project`        | Clear the assignment fields on a project.                                                                                                    |

## GitHub Operations (11 tools)

| Tool                      | Description                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge_pr`                | Merge a pull request using GitHub CLI. Supports different merge strategies (merge, squash, rebase) and can optionally wait for CI checks...   |
| `check_pr_status`         | Check the CI check status of a pull request. Returns information about passed, failed, and pending checks.                                    |
| `get_pr_feedback`         | Fetch CodeRabbit review feedback for a PR, including both issue-level and inline review threads with severity. Returns parsed feedback wi...  |
| `resolve_pr_threads`      | Resolve all unresolved CodeRabbit review threads for a PR using the GitHub GraphQL resolveReviewThread mutation. Fetches PRRT\_ thread nod... |
| `list_worktrees`          | List all git worktrees for a project. Returns worktree paths, branches, and optionally PR info.                                               |
| `get_worktree_status`     | Get the git status of a specific worktree for a feature. Returns modified files, diff stats, and recent commits.                              |
| `create_pr_from_worktree` | Commit, push, and create a PR from a worktree. Handles the full workflow: stage changes, commit, push branch, create GitHub PR.               |
| `get_pr_review_comments`  | List inline code review comment threads on a PR via GitHub GraphQL API. Returns thread IDs, file paths, line numbers, and comment bodies.     |
| `resolve_pr_comment`      | Resolve a single PR review thread by thread ID via GitHub GraphQL resolveReviewThread mutation.                                               |
| `add_github_comment`      | Post a comment to an existing GitHub issue. Returns the comment URL and confirmation.                                                         |
| `verify_triage_evidence`  | Deterministically verify that the file paths you cite as triage evidence actually exist at a git ref, BEFORE applying a classification. Y...  |

## Git Operations (2 tools)

| Tool                  | Description                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `git_enhanced_status` | Get detailed per-file git status including index status, work tree status, conflict markers, staged state, and line-change counts. |
| `git_file_details`    | Get the last commit information for a specific file including commit hash, message, author, and timestamp.                         |

## Lead Engineer (4 tools)

| Tool                       | Description                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_lead_engineer`      | Start the lead engineer agent to coordinate feature development. The lead engineer reviews PRs, manages dependencies, and orchestrates mu... |
| `stop_lead_engineer`       | Stop the lead engineer agent.                                                                                                                |
| `get_lead_engineer_status` | Get the current status of the lead engineer agent.                                                                                           |
| `get_feature_handoff`      | Get the handoff state for a feature. Returns what the lead engineer has reviewed, approved, or flagged for changes.                          |

## Notes & Workspace (6 tools)

| Tool              | Description                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `query_board`     | Query features with compound filters. Supports filtering by status, epic, complexity, blocked state, dependencies, date range, and text s... |
| `list_note_tabs`  | List all note tabs in a project workspace. Returns tab names, permissions (agentRead/agentWrite), and word counts. Only tabs with agentRe... |
| `read_note_tab`   | Read the content of a specific note tab. Requires agentRead permission on the tab. Returns HTML content, word count, and metadata.           |
| `write_note_tab`  | Write content to a specific note tab. Requires agentWrite permission on the tab. Supports replace (default) or append mode. Content shoul... |
| `create_note_tab` | Create a new note tab in the workspace. Returns the created tab with its ID.                                                                 |
| `delete_note_tab` | Delete a note tab from the workspace. Cannot delete the last remaining tab.                                                                  |

## Observability (5 tools)

| Tool                   | Description                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `get_settings`         | Get global Automaker settings including theme, log level, auto-mode config, and project profiles.           |
| `update_settings`      | Update global Automaker settings. Pass only the fields you want to change.                                  |
| `get_project_metrics`  | Get aggregated project metrics including cycle time, cost, throughput, success rate, and token usage.       |
| `get_capacity_metrics` | Get capacity utilization metrics including concurrency, backlog size, and estimated backlog clearance time. |
| `get_forecast`         | Estimate duration and cost for a new feature based on historical averages scaled by complexity.             |

## Knowledge (4 tools)

| Tool                | Description                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge_search`  | Search the project knowledge base for relevant documents, code snippets, and documentation. Returns ranked results with relevance scores. |
| `knowledge_ingest`  | Ingest documents into the knowledge base. Supports markdown, text, and code files. Automatically extracts and indexes content.            |
| `knowledge_rebuild` | Rebuild the entire knowledge base index. Use this after major project changes or if search results seem stale.                            |
| `knowledge_stats`   | Get statistics about the knowledge base: document count, index size, last update time, and search performance metrics.                    |

## QA (1 tools)

| Tool           | Description                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_qa_check` | Run automated quality assurance checks on a project or feature. Checks include code quality, test coverage, documentation completeness, a... |

## Scheduler (2 tools)

| Tool                      | Description                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `get_scheduler_status`    | Get the status of the maintenance task scheduler. Returns scheduled tasks, next run times, and last execution results. |
| `update_maintenance_task` | Update a maintenance task configuration. Can change schedule, enable/disable, or update parameters.                    |

## Cross-Repo (2 tools)

| Tool                            | Description                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `flag_cross_repo_dependency`    | Flag a cross-repository dependency. Creates a dependency record with status "pending".               |
| `resolve_cross_repo_dependency` | Mark a cross-repository dependency as resolved. Updates status to "resolved" with a resolution note. |

## SetupLab (6 tools)

| Tool                | Description                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `research_repo`     | Research a repository by reading key files (package.json, README, tsconfig, etc.) and generating a RepoResearchResult. Use this before se... |
| `analyze_gaps`      | Analyze gaps between current repository state and desired Automaker configuration. Returns a list of missing or misconfigured items.         |
| `propose_alignment` | Generate a proposed alignment plan to fix gaps identified by analyze_gaps. Returns actionable steps.                                         |
| `provision_discord` | Provision a Discord integration for the project. Creates a webhook and stores credentials securely.                                          |
| `generate_report`   | Generate a comprehensive project report including board status, metrics, and recommendations.                                                |
| `run_full_setup`    | Run the complete setup pipeline: research → analyze → propose → execute alignment. Automates the entire onboarding process.                  |

## Integrations (4 tools)

| Tool                   | Description                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `request_user_input`   | Create a HITL form request that renders as a dialog in the UI. Provide JSON Schema definitions for each form step. Returns a formId — pol... |
| `get_form_response`    | Check the status of a HITL form request and retrieve the user response when submitted. Poll this after calling request_user_input.           |
| `list_pending_forms`   | List all pending HITL form requests for a project. Returns form summaries with formId, title, featureId, and expiresAt.                      |
| `submit_form_response` | Programmatically submit a response to a pending HITL form. Allows Ava to answer form questions on behalf of the user, which resumes the w... |

## Utilities (6 tools)

| Tool              | Description                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup_lab`       | Initialize Automaker for a new repository. Creates .automaker/ directory structure (features/, context/, memory/), generates protolab.con... |
| `health_check`    | Check if the Automaker server is running and healthy. Set detailed: true to include memory usage, uptime, and environment info.              |
| `get_server_logs` | Read server log file directly from disk. Works even when the server is down — useful for diagnosing crashes, OOM errors, agent failures,...  |
| `get_sitrep`      | Get a full operational status report in one call. Returns board summary, running agents, auto-mode status, blocked features, escalations...  |
| `get_briefing`    | Get a briefing digest of important events since last session. Returns events grouped by severity (critical, high, medium, low) for quick...  |
| `submit_prd`      | Submit a SPARC PRD from the Chief of Staff to the Project Manager for decomposition and execution. Creates a feature on the board.           |
