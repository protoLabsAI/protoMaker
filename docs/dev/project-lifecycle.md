# Project Lifecycle Flow

Linear as the single source of truth for project state. Projects flow from idea to completion through a state machine managed by Linear project statuses and labels.

## State Machine

```
planned + "idea"          → User expanding the idea
planned + "idea-approved" → PRD being generated/reviewed
planned + "prd-approved"  → Milestones created, ready to launch
started                   → Auto-mode running, agents implementing
completed                 → All features done
```

## MCP Tools

| Tool                     | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `initiate_project`       | Dedup check + create Linear project + write idea doc           |
| `generate_project_prd`   | Check for existing PRD, suggest generation if missing          |
| `approve_project_prd`    | Create board features from milestones + sync to Linear         |
| `launch_project`         | Set Linear status to "started" + start auto-mode               |
| `get_lifecycle_status`   | Read Linear + local state, return current phase + next actions |
| `collect_related_issues` | Move existing Linear issues into a project                     |

## Skill

Use `/plan-project <idea>` to run the full flow with human gates at each step.

## API Endpoints

All endpoints are under `POST /api/projects/lifecycle/`:

- `/initiate` — Create project in Linear
- `/generate-prd` — Check/return PRD status
- `/approve-prd` — Create features from milestones
- `/launch` — Start auto-mode
- `/status` — Get lifecycle phase
- `/collect-related` — Add issues to project

## Key Files

| File                                                             | Purpose                             |
| ---------------------------------------------------------------- | ----------------------------------- |
| `apps/server/src/services/project-lifecycle-service.ts`          | Service orchestrating the lifecycle |
| `apps/server/src/routes/projects/lifecycle/`                     | Route handlers                      |
| `packages/mcp-server/plugins/automaker/commands/plan-project.md` | Skill file                          |
| `libs/types/src/project.ts`                                      | `ProjectLifecyclePhase` type        |

## Mid-Stream Joins

The lifecycle supports joining at any phase. Call `get_lifecycle_status` first to determine where a project is:

- If project has PRD + milestones but no board features → `approve_project_prd`
- If project has board features in backlog → `launch_project`
- If project is already running → show status

This enables launching existing projects (like CopilotKit) that were set up before the lifecycle flow existed.

## Content Storage

Linear has no document API, so content is stored pragmatically:

- **Idea doc** → Linear project `description` field (markdown)
- **PRD** → Local `.automaker/projects/{slug}/project.json`
- **Milestones** → Both local project files and Linear project milestones
