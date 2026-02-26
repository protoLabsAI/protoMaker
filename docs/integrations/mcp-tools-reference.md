# MCP Tools Reference

Complete catalog of **135 MCP tools** exposed by the protoLabs server. See `packages/mcp-server/src/index.ts` for the full definitions.

For installation and configuration, see [Claude Plugin Setup](./claude-plugin.md). For commands and examples, see [Plugin Commands](./plugin-commands.md).

## Feature Management (7 tools)

| Tool                          | Description                                      |
| ----------------------------- | ------------------------------------------------ |
| `list_features`               | List all features, optionally filtered by status |
| `get_feature`                 | Get detailed info about a specific feature       |
| `create_feature`              | Create a new feature on the board                |
| `update_feature`              | Update feature properties                        |
| `delete_feature`              | Delete a feature                                 |
| `move_feature`                | Move feature to a different column               |
| `update_feature_git_settings` | Update git branch/worktree settings for feature  |

## Agent Control (5 tools)

| Tool                    | Description                          |
| ----------------------- | ------------------------------------ |
| `start_agent`           | Start an AI agent on a feature       |
| `stop_agent`            | Stop a running agent                 |
| `list_running_agents`   | List all currently running agents    |
| `get_agent_output`      | Get the log/output from an agent run |
| `send_message_to_agent` | Send a message to a running agent    |

## Queue Management (3 tools)

| Tool            | Description                           |
| --------------- | ------------------------------------- |
| `queue_feature` | Add a feature to the processing queue |
| `list_queue`    | List queued features                  |
| `clear_queue`   | Clear the queue                       |

## Context & Skills (8 tools)

| Tool                  | Description                       |
| --------------------- | --------------------------------- |
| `list_context_files`  | List files in .automaker/context/ |
| `get_context_file`    | Read a context file               |
| `create_context_file` | Create a new context file         |
| `delete_context_file` | Delete a context file             |
| `list_skills`         | List skills in .automaker/skills/ |
| `get_skill`           | Read a skill file                 |
| `create_skill`        | Create a new skill file           |
| `delete_skill`        | Delete a skill file               |

## Project Spec (2 tools)

| Tool                  | Description                    |
| --------------------- | ------------------------------ |
| `get_project_spec`    | Get .automaker/spec.md content |
| `update_project_spec` | Update the project spec        |

## Orchestration (6 tools)

| Tool                       | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `set_feature_dependencies` | Set dependencies for a feature                     |
| `get_dependency_graph`     | Get the full dependency graph for all features     |
| `start_auto_mode`          | Start auto-mode with configurable concurrency      |
| `stop_auto_mode`           | Stop auto-mode for a project                       |
| `get_auto_mode_status`     | Check if auto-mode is running                      |
| `get_execution_order`      | Get resolved execution order based on dependencies |

## Project Orchestration (7 tools)

| Tool                      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `list_projects`           | List all project plans in a project                               |
| `get_project`             | Get project details including milestones, phases, and PRD         |
| `create_project`          | Create a new project with SPARC PRD and milestone/phase structure |
| `update_project`          | Update project title, goal, or status                             |
| `delete_project`          | Delete a project plan and all its files                           |
| `archive_project`         | Archive a completed project                                       |
| `create_project_features` | Convert project phases to Kanban board features with epic support |

### Using Project Tools

```
[Calls mcp__automaker__create_project with:
  projectPath: "/path/to/project"
  title: "User Authentication System"
  goal: "Add secure user authentication"
  prd: {
    situation: "The application has no authentication...",
    problem: "Users cannot securely access protected resources...",
    approach: "Implement JWT-based auth with bcrypt...",
    results: "Secure auth with login, register, logout",
    constraints: ["Must be backwards compatible"]
  }
  milestones: [...]
]

[Calls mcp__automaker__create_project_features with:
  projectPath: "/path/to/project"
  projectSlug: "user-authentication-system"
  createEpics: true
  setupDependencies: true]
```

### Project Structure

After creation, project files are organized as:

```
.automaker/projects/user-authentication-system/
├── project.md           # High-level overview
├── project.json         # Full structured data
├── prd.md              # SPARC PRD document
└── milestones/
    ├── 01-foundation/
    │   ├── milestone.md
    │   ├── phase-01-add-user-types.md
    │   └── phase-02-create-auth-service.md
    └── 02-api-endpoints/
        ├── milestone.md
        └── phase-01-auth-routes.md
```

### Epic Features

When `createEpics: true`, each milestone becomes an epic feature. Phase 1 of each milestone is automatically marked `isFoundation: true` — downstream features won't start until the foundation's PR is merged to main.

## Project Lifecycle (7 tools)

| Tool                     | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `initiate_project`       | Start the full project lifecycle                |
| `generate_project_prd`   | Generate a SPARC PRD for a project              |
| `approve_project_prd`    | Approve or reject a generated PRD               |
| `launch_project`         | Launch an approved project into execution       |
| `get_lifecycle_status`   | Get current lifecycle stage for a project       |
| `collect_related_issues` | Gather Linear issues related to a project       |
| `sync_project_to_linear` | Sync project milestones/phases to Linear issues |

## PRD & CoS Pipeline (1 tool)

| Tool         | Description                                      |
| ------------ | ------------------------------------------------ |
| `submit_prd` | Submit a PRD through the CoS pipeline for review |

## GitHub Operations (4 tools)

| Tool                 | Description                          |
| -------------------- | ------------------------------------ |
| `merge_pr`           | Merge a pull request                 |
| `check_pr_status`    | Check PR status (CI, reviews, merge) |
| `get_pr_feedback`    | Get PR review feedback               |
| `resolve_pr_threads` | Resolve CodeRabbit review threads    |

## Escalation (3 tools)

| Tool                     | Description                      |
| ------------------------ | -------------------------------- |
| `get_escalation_status`  | Get current escalation state     |
| `get_escalation_log`     | Get escalation history           |
| `acknowledge_escalation` | Acknowledge and resolve an alert |

## Lead Engineer (3 tools)

| Tool                       | Description                      |
| -------------------------- | -------------------------------- |
| `start_lead_engineer`      | Start the lead engineer service  |
| `stop_lead_engineer`       | Stop the lead engineer service   |
| `get_lead_engineer_status` | Get lead engineer running status |

## Worktrees (3 tools)

| Tool                      | Description                          |
| ------------------------- | ------------------------------------ |
| `list_worktrees`          | List all git worktrees for a project |
| `get_worktree_status`     | Get status of a specific worktree    |
| `create_pr_from_worktree` | Create a PR from worktree changes    |

## Agent Templates (7 tools)

| Tool                        | Description                         |
| --------------------------- | ----------------------------------- |
| `list_agent_templates`      | List all registered agent templates |
| `get_agent_template`        | Get a specific template by name     |
| `register_agent_template`   | Register a new agent template       |
| `update_agent_template`     | Update an existing template         |
| `unregister_agent_template` | Remove a template                   |
| `execute_dynamic_agent`     | Execute an agent from a template    |
| `get_role_registry_status`  | Get template registry statistics    |

## Content Pipeline (6 tools)

| Tool                          | Description                          |
| ----------------------------- | ------------------------------------ |
| `create_content`              | Start a content creation flow        |
| `get_content_status`          | Get content flow progress and gates  |
| `list_content`                | List all content flows               |
| `review_content`              | Approve/revise/reject at HITL gates  |
| `export_content`              | Export final content to file formats |
| `execute_antagonistic_review` | Run antagonistic quality review      |

## Notes Management (8 tools)

| Tool                          | Description                                    |
| ----------------------------- | ---------------------------------------------- |
| `list_note_tabs`              | List all note tabs with permissions and counts |
| `read_note_tab`               | Read tab content (requires agentRead)          |
| `write_note_tab`              | Write to a tab (requires agentWrite)           |
| `create_note_tab`             | Create a new note tab                          |
| `delete_note_tab`             | Delete a tab (not the last one)                |
| `rename_note_tab`             | Rename a tab                                   |
| `update_note_tab_permissions` | Update agentRead/agentWrite permissions        |
| `reorder_note_tabs`           | Reorder tabs in the workspace                  |

## Reports (2 tools)

| Tool              | Description                     |
| ----------------- | ------------------------------- |
| `generate_report` | Generate a project/board report |
| `open_report`     | Open a generated report         |

## SetupLab (7 tools)

| Tool                | Description                            |
| ------------------- | -------------------------------------- |
| `setup_lab`         | Run setupLab analysis on a project     |
| `research_repo`     | Research a repository's structure      |
| `analyze_gaps`      | Analyze gaps against gold standard     |
| `propose_alignment` | Propose alignment work for a repo      |
| `clone_repo`        | Clone a repository for analysis        |
| `deliver_alignment` | Deliver alignment changes to a project |
| `run_full_setup`    | Run the full setupLab pipeline         |

## Discord (4 tools)

| Tool                | Description                            |
| ------------------- | -------------------------------------- |
| `send_discord_dm`   | Send a Discord direct message          |
| `read_discord_dms`  | Read recent Discord DMs                |
| `provision_discord` | Provision Discord server for a project |
| `trigger_ceremony`  | Trigger an agile ceremony via Discord  |

## Setup & Beads (1 tool)

| Tool          | Description                   |
| ------------- | ----------------------------- |
| `setup_beads` | Initialize Beads task tracker |

## Settings & Health (4 tools)

| Tool                  | Description                        |
| --------------------- | ---------------------------------- |
| `get_settings`        | Get project or global settings     |
| `update_settings`     | Update settings                    |
| `get_detailed_health` | Get detailed server health metrics |
| `get_server_logs`     | Get recent server log entries      |

## Events & Notifications (2 tools)

| Tool                 | Description               |
| -------------------- | ------------------------- |
| `list_events`        | List recent system events |
| `list_notifications` | List notification history |

## Metrics & Forecasting (3 tools)

| Tool                   | Description                        |
| ---------------------- | ---------------------------------- |
| `get_project_metrics`  | Get project-level metrics          |
| `get_capacity_metrics` | Get agent capacity and utilization |
| `get_forecast`         | Get delivery forecasts             |

## Observability (6 tools)

| Tool                      | Description                        |
| ------------------------- | ---------------------------------- |
| `langfuse_list_traces`    | List Langfuse traces               |
| `langfuse_get_trace`      | Get a specific trace               |
| `langfuse_get_costs`      | Get cost breakdown                 |
| `langfuse_list_prompts`   | List prompt versions               |
| `langfuse_score_trace`    | Score a trace for quality tracking |
| `langfuse_add_to_dataset` | Add trace to evaluation dataset    |

## Utilities (4 tools)

| Tool                | Description                          |
| ------------------- | ------------------------------------ |
| `health_check`      | Check if protoLabs server is running |
| `get_board_summary` | Get feature counts by status         |
| `get_briefing`      | Get operational briefing digest      |
| `graphite_restack`  | Restack Graphite branch stacks       |

## Other (1 tool)

| Tool           | Description                                    |
| -------------- | ---------------------------------------------- |
| `process_idea` | Process a raw idea through the intake pipeline |

## Related Documentation

- [Claude Plugin Setup](./claude-plugin.md) — Installation, configuration, Docker deployment
- [Plugin Commands](./plugin-commands.md) — Commands, subagents, examples
- [MCP Integration](/agents/mcp-integration) — How MCP tools interact with agents
