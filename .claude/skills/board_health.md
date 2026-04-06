---
name: board_health
description: Quinn subskill — detect stale PRs across monitored repos and create board features for Ava. Posts a summary to the #alerts Discord channel. Triggered manually via /quinn health or automatically by the stale-pr-check cron (every 3 hours).
category: qa
argument-hint: '[project-path] (optional — defaults to current project path)'
allowed-tools:
  - Read
  - Bash
  - mcp__plugin_protolabs_studio__list_features
  - mcp__plugin_protolabs_studio__create_feature
  - mcp__plugin_protolabs_studio__get_settings
  - mcp__plugin_protolabs_discord__discord_send
---

# board_health — Stale PR Detection Skill

You are executing the `board_health` subskill for Quinn. Detect stale PRs across all
monitored GitHub repos and create Ava board features so the team can track and resolve them.

## Stale PR Criteria

A PR is stale if **any one** of the following applies:

- Open > 2 hours with no commits, reviews, or comments (`updatedAt` > 2 hours ago)
- CI failing with no new push in the last 2 hours
- Draft status > 2 hours

## Step 1 — Load Monitored Repos

Read the workspace routing index:

```bash
cat workspace/projects.yaml
```

Extract all entries where `status: active`. The `github` field contains `<owner>/<repo>`.

If the file is missing or `projects` is empty, report "No repos monitored — nothing to check."
and stop.

## Step 2 — Detect Stale PRs Per Repo

For each active repo's `github` field:

```bash
python3 tools/board_monitor.py stale_prs --repo <owner/repo>
```

Output is a JSON array of stale PR objects:

```json
[
  {
    "number": 42,
    "title": "Add feature X",
    "headRefName": "feature/add-x",
    "updatedAt": "2026-04-05T10:00:00Z",
    "hoursOpen": 4.5,
    "isDraft": false,
    "ciState": "failing",
    "hasReviews": false,
    "recommendedAction": "Fix failing CI checks and push a new commit."
  }
]
```

If the command fails (non-zero exit or JSON parse error), log the error, skip that repo,
and continue to the next one. Never abort the entire run due to a single repo failing.

## Step 3 — Create Board Features for Stale PRs

For each stale PR, check for an existing feature first to avoid duplicates:

```
mcp__plugin_protolabs_studio__list_features({ projectPath, status: ['backlog', 'in_progress'] })
```

If a feature with title `Stale PR: <owner/repo>#<number> — <pr.title>` already exists in
`backlog` or `in_progress`, skip creation and count it as a duplicate.

Otherwise, create a feature:

```
mcp__plugin_protolabs_studio__create_feature({
  projectPath: <current project path>,
  feature: {
    title: "Stale PR: <owner/repo>#<number> — <pr.title>",
    description: <see template below>,
    priority: 2,
    status: "backlog"
  }
})
```

**Description template:**

```
PR #<number> in <owner/repo> has been open for <hoursOpen> hours without activity.

**Branch:** `<headRefName>`
**Last activity:** <updatedAt>
**CI:** <ciState or 'unknown'>
**Has reviews:** <yes/no>
**Draft:** <yes/no>

**Recommended action:** <recommendedAction>

_Detected by Quinn board_health at <current ISO timestamp>._
```

## Step 4 — Post Summary to #alerts

After processing all repos, post a Discord message to the project's #alerts channel.

Resolve the channel: read it from project settings (`integrations.discord.channels.alerts`),
or fall back to the global #alerts channel (ID: `1469109811915522301`).

**If stale PRs were found:**

```
Board Health — Stale PR Summary

Repos checked: <N>
Stale PRs found: <total>
Features created: <created>
Skipped (already tracked): <skipped>

<list each stale PR:>
- <owner/repo>#<number>: <title> (<hoursOpen>h open, CI: <ciState or 'unknown'>)

Next check: ~3 hours
```

**If no stale PRs were found:**

```
Board Health — No stale PRs found across <N> repos. All clear.
```

## Completion Report

After posting to Discord, output:

```
board_health complete.

Repos checked: <N>
Stale PRs found: <total>
Features created: <created>
Duplicates skipped: <skipped>
Errors: <error count>
Summary posted to #alerts: <yes / no — reason>
```

## Error Handling

- `board_monitor.py` not found: report the error and stop.
- `gh` not authenticated: the script will report an auth error — surface it and stop.
- Discord send failure: log the summary to output instead, do not fail the skill.
- Single repo failure: skip it, record the error, continue to remaining repos.
