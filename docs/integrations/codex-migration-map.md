# Codex Migration Map

This page maps the existing Claude-oriented skills, agents, and commands in this repo to a Codex-native structure.

The goal is seamless operator behavior in Codex without changing any current Claude functionality.

## Translation Model

Translate each Claude asset by role, not by filename:

- stable repo rules -> `AGENTS.md`
- reusable operating workflow -> Codex skill
- supporting runbook -> skill reference playbook
- delegated execution persona -> subagent pattern only if needed
- capability surface -> existing MCP server

## Current Sources

There are two main Claude-oriented layers in this repo:

- project-level assets in `.claude/`
- plugin-level assets in `packages/mcp-server/plugins/automaker/`

## Recommended Codex Mapping

| Existing Asset Type                 | Current Location                                                                 | Codex-Native Target                         | Notes                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Repo rules                          | `CLAUDE.md`, `.claude/settings.json`                                             | `AGENTS.md`                                 | Keep stable instructions here                          |
| Ava operator workflow               | `plugins/.../commands/ava.md`                                                    | `.codex/skills/ava/SKILL.md`                | Main orchestration skill                               |
| Headsdown workflow                  | `plugins/.../commands/headsdown.md`                                              | `.codex/skills/headsdown/SKILL.md`          | Continuous deep work skill                             |
| Lightweight operational specialists | `.claude/skills/board-janitor.md`, `.claude/skills/pr-maintainer.md`             | Ava playbooks first                         | Promote to full skills only if needed                  |
| Team role specialists               | `.claude/skills/matt.md`, `kai.md`, `frank.md`, `jon.md`, `cindi.md`             | future Codex skills or subagent conventions | Create only as demand appears                          |
| Analysis agents                     | `.claude/agents/deepdive.md`, `deepcode.md`, `security-vulnerability-scanner.md` | future subagent patterns                    | Better as delegation patterns than static prose clones |
| Plugin commands                     | `plugins/.../commands/*.md`                                                      | Codex skills selectively                    | Only port the workflows that matter                    |
| Capability tools                    | `packages/mcp-server/`                                                           | unchanged MCP server                        | Reuse directly from Codex                              |

## Immediate Migration Set

These are the highest-value Codex-native equivalents to maintain operator continuity:

- `ava`
- `headsdown`
- `deep-research`
- `deep-dive`
- `due-diligence`
- `plan-project`
- `AGENTS.md`
- MCP connection to the existing protoLabs server

## Near-Term Candidates

These should likely come next if the Codex workflow sticks:

- `setuplab`
- role-specialist skills such as `matt`, `kai`, `frank`, `jon`, `cindi`

## Team Skill Interpretation

The project-level Claude skills split into two groups:

### Specialist Implementers

- `matt`
- `kai`
- `frank`
- `jon`
- `cindi`

These map well to future Codex skills if you want explicit role activation.

### Operational Utilities

- `pr-maintainer`
- `board-janitor`

These may not need standalone skills immediately. Many of their behaviors can live as Ava playbooks until the workflow volume justifies separate Codex skills.

## Agent Interpretation

The Claude agents are best treated as patterns for delegation rather than direct one-to-one ports.

Examples:

- `deepdive` -> Codex-native `deep-dive` skill for investigation
- `security-vulnerability-scanner` -> security review delegated subagent pattern
- `feature-planner` -> planning delegated subagent pattern
- plugin `deep-research` command -> Codex-native `deep-research` skill
- plugin `due-diligence` command -> Codex-native `due-diligence` skill

In Codex, this usually means:

- keep the orchestration logic in the main skill
- delegate bounded subtasks only when necessary
- avoid creating a static subagent for every historical Claude persona

## Migration Principle

Do not clone every Claude command into Codex.

Port only the workflows that:

- are used frequently
- encode real operating discipline
- benefit from Codex-native repetition

Everything else should either stay in docs, become a small playbook, or wait until usage proves it deserves a full skill.

## Related

- [Codex CLI Integration](./codex-cli.md)
- [Claude Code Plugin](./claude-plugin.md)
- [Plugin Deep Dive](./plugin-deep-dive.md)
