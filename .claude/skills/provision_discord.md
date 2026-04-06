---
name: provision_discord
description: Provision Discord channels for a new project. Creates a category with #general, #updates, and #dev channels. Returns channel names for writing back to project settings.json.
category: ops
argument-hint: 'projectTitle=<title> projectSlug=<slug>'
allowed-tools:
  - Read
  - Bash
  - mcp__plugin_protolabs_studio__provision_discord
  - mcp__plugin_protolabs_studio__get_settings
  - mcp__plugin_protolabs_discord__discord_send
  - mcp__plugin_protolabs_discord__discord_get_server_info
---

# provision_discord — Discord Channel Provisioning Skill

You are executing the `provision_discord` A2A skill on behalf of Quinn (or as a chained
sub-task from onboard_project). You create Discord channels for a newly onboarded project.

## Input

You receive two arguments:

- `projectTitle` — human-readable project name (e.g. `protoWorkstacean`)
- `projectSlug` — kebab-case slug (e.g. `protolabsai-protoworkstacean`)

## Step 1 — Resolve Guild ID

Read the Guild ID from settings or environment:

```
guildId = DISCORD_GUILD_ID env var ?? "1070606339363049492"
```

## Step 2 — Call provision_discord MCP Tool

Call `mcp__plugin_protolabs_studio__provision_discord` with:

- `projectPath` — the current project path (resolve from context)
- `projectName` — `projectTitle`
- `guildId` — from Step 1

The tool returns:

```json
{
  "success": true,
  "result": {
    "channels": {
      "general": "<projectName>-general",
      "updates": "<projectName>-updates",
      "dev": "<projectName>-dev"
    }
  }
}
```

## Step 3 — Return Channel Info

Return the channel map to the caller:

```json
{
  "projectSlug": "<projectSlug>",
  "discord": {
    "channels": {
      "general": "<returned general>",
      "updates": "<returned updates>",
      "dev": "<returned dev>"
    }
  }
}
```

## Error Handling

- If `provision_discord` returns `success: false` or throws, return:
  ```json
  { "error": "<message>", "projectSlug": "<projectSlug>", "discord": { "channels": {} } }
  ```
- Never block the calling skill on a Discord provisioning failure.

## Notes

- This skill is called by `onboard_project` (Step 6) and should be fast — no interactive
  prompts or confirmation loops.
- The caller (onboard_project) is responsible for writing returned channel IDs to settings.json.
