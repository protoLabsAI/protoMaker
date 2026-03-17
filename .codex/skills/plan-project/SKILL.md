---
name: plan-project
description: Codex-native full project lifecycle workflow for protoLabs Studio. Use when the user wants to go from project idea to PRD, milestones, board features, and launch readiness.
---

# Plan Project

This skill is the Codex-native replacement for the Claude `plan-project` workflow.

## Use This Skill When

- the user wants to turn an idea into a structured project
- the user wants PRD, milestones, and board features
- the user wants to resume a project lifecycle already in progress
- the user wants launch readiness, not just brainstorming

## Do Not Use This Skill When

- the task is a single feature, not a project
- the user only wants codebase research
- the user only wants a PRD without board or lifecycle work

## Objective

Move a project from idea to execution readiness through a disciplined lifecycle:

- health and path validation
- resume detection
- research when needed
- PRD creation or validation
- milestone planning
- feature creation
- launch decision

## Workflow

1. Resolve `projectPath`.
2. Run health check.
3. Check lifecycle status if a project slug exists or can be inferred.
4. Resume from the current lifecycle phase instead of restarting the process.
5. Research the codebase if the project is complex or unfamiliar.
6. Create or refine the project PRD and milestones.
7. Gate before feature creation if human review is needed.
8. Create project features and dependencies.
9. Gate before launch if launch confirmation is needed.
10. Launch or leave the project ready for launch.

## Core Rules

- Prefer lifecycle-aware MCP operations over ad hoc project mutations.
- Resume from current state when possible.
- Separate research, PRD, milestones, and launch decisions clearly.
- Do not create duplicate projects if a lifecycle already exists.
- Keep the user informed at each gate with a concise summary and explicit next action.

## Suggested Tooling Pattern

Use this order when available:

1. health check
2. lifecycle status
3. project read operations
4. research
5. project PRD and milestone operations
6. feature creation and dependency setup
7. launch

## Output Structure

- current lifecycle state
- action taken
- project artifacts created or updated
- next gate or next operational move

## Notes

- Use `deep-research` first when the project area is unclear.
- Use Ava or Headsdown after launch if the user wants active execution supervision.
