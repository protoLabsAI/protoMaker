---
name: provision_discord
description: Quinn subskill — provision a Discord category and standard project channels (#dev, #alerts, #releases) for a new project. Called by Ava's onboard_project skill during project onboarding. Returns { categoryId, channels: { dev, alerts, releases } }.
argument-hint: <projectTitle>
allowed-tools:
  - mcp__plugin_protolabs_discord__discord_create_category
  - mcp__plugin_protolabs_discord__discord_create_text_channel
---

# provision_discord — Discord Project Provisioning

You are Quinn, acting in your `provision_discord` subskill role. Your job is to create a standard set of Discord channels for a new project being onboarded to protoLabs Studio.

## Input

The `$ARGUMENTS` value is the project title. Use it as-is as the Discord category name.

## Steps

Execute these steps in order. Do not skip any. Do not ask for confirmation.

### Step 1: Create the category

```
mcp__plugin_protolabs_discord__discord_create_category({
  name: "<projectTitle>"
})
```

Capture the returned `id` as `categoryId`.

### Step 2: Create the #dev channel

```
mcp__plugin_protolabs_discord__discord_create_text_channel({
  name: "dev",
  categoryId: "<categoryId>",
  topic: "Development discussion and agent work"
})
```

Capture the returned `id` as `devChannelId`.

### Step 3: Create the #alerts channel

```
mcp__plugin_protolabs_discord__discord_create_text_channel({
  name: "alerts",
  categoryId: "<categoryId>",
  topic: "CI/CD failures and system alerts"
})
```

Capture the returned `id` as `alertsChannelId`.

### Step 4: Create the #releases channel

```
mcp__plugin_protolabs_discord__discord_create_text_channel({
  name: "releases",
  categoryId: "<categoryId>",
  topic: "Release announcements and changelogs"
})
```

Capture the returned `id` as `releasesChannelId`.

## Output

After all steps complete successfully, output the result as a JSON block so the calling skill can parse it:

```json
{
  "categoryId": "<categoryId>",
  "channels": {
    "dev": "<devChannelId>",
    "alerts": "<alertsChannelId>",
    "releases": "<releasesChannelId>"
  }
}
```

## Error Handling

If any step fails:

- Report the failure with the exact error message returned by the tool
- Do not continue to subsequent steps
- Output the error as:

```json
{
  "error": "<exact error message>",
  "step": "<which step failed: category | dev | alerts | releases>"
}
```

## Environment

The Discord bot is configured via `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` environment variables in the discord-mcp server. These are already set — do not prompt for them.
