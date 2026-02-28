# Temporary Skills Registry

Skills and commands that exist for a specific purpose and should be removed once that purpose is served. Check this file during quarterly cleanup or when the removal condition is met.

## Active Temporary Skills

| Skill             | Type    | Added      | Remove When             | Reason                                                                  |
| ----------------- | ------- | ---------- | ----------------------- | ----------------------------------------------------------------------- |
| `/upgrade-plugin` | command | 2026-02-28 | All testers on v0.15.x+ | Early tester migration from v1.1.1 plugin to monorepo-synced versioning |

## Removal Checklist

When removing a temporary skill:

1. Delete the command/agent file from `commands/` or `agents/`
2. Remove the row from this table
3. Grep the codebase for references to the skill name
4. Commit with message: `chore: remove temp skill /<name> — <reason fulfilled>`

## Retired Skills

| Skill      | Removed | Why |
| ---------- | ------- | --- |
| (none yet) |         |     |
