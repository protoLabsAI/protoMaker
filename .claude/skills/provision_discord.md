---
name: provision_discord
description: Provision Discord channels for a new project. Creates a category with #general, #updates, and #dev channels. Returns channel names/IDs for writing back to project settings.json.
category: ops
argument-hint: 'projectTitle=<title> projectSlug=<slug>'
allowed-tools:
  - Read
  - Bash
---

# provision_discord — Discord Channel Provisioning Skill

You are executing the `provision_discord` skill. Create Discord channels for a newly
onboarded project using the Discord REST API via `Bash`.

**EXECUTE IMMEDIATELY. No questions. All values derived from input or env vars.**

## Input

You receive:

- `projectTitle` — human-readable project name (e.g. `protoUI`)
- `projectSlug` — kebab-case slug (e.g. `protolabsai-protoui`)

## Step 1 — Resolve Config

```bash
GUILD_ID=${DISCORD_GUILD_ID:-1070606339363049492}
DISCORD_API="https://discord.com/api/v10"
AUTH_HEADER="Authorization: Bot ${DISCORD_TOKEN}"

echo "Guild: $GUILD_ID"
echo "Token set: $([ -n "$DISCORD_TOKEN" ] && echo yes || echo NO — aborting)"
[ -z "$DISCORD_TOKEN" ] && exit 1
```

## Step 2 — Create Project Category

```bash
CATEGORY_RESP=$(curl -sf -X POST "${DISCORD_API}/guilds/${GUILD_ID}/channels" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"<projectTitle>\", \"type\": 4}" 2>&1)

CATEGORY_ID=$(echo "$CATEGORY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
echo "Category ID: $CATEGORY_ID"
[ -z "$CATEGORY_ID" ] && echo "Failed to create category: $CATEGORY_RESP" && exit 1
```

## Step 3 — Create Channels Under Category

Create #general, #updates, and #dev text channels (type 0) under the category:

```bash
for CHAN_NAME in general updates dev; do
  RESP=$(curl -sf -X POST "${DISCORD_API}/guilds/${GUILD_ID}/channels" \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${CHAN_NAME}\", \"type\": 0, \"parent_id\": \"${CATEGORY_ID}\"}" 2>&1)
  CHAN_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
  echo "Created #${CHAN_NAME}: $CHAN_ID"
  eval "CHAN_${CHAN_NAME^^}=$CHAN_ID"
done
```

## Step 4 — Post Kickoff Message to #dev

```bash
curl -sf -X POST "${DISCORD_API}/channels/${CHAN_DEV}/messages" \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"🚀 **<projectTitle>** is now onboarded to protoLabs Studio. Discord channels are ready. Agents can start working.\"}" 2>&1
echo "Kickoff message sent to #dev ($CHAN_DEV)"
```

## Step 5 — Return Channel Map

Output the channel map as JSON so the caller can parse it:

```json
{
  "projectSlug": "<projectSlug>",
  "discord": {
    "channels": {
      "general": "<CHAN_GENERAL ID>",
      "updates": "<CHAN_UPDATES ID>",
      "dev": "<CHAN_DEV ID>"
    }
  }
}
```

Print it as the final output — the caller extracts this with `python3 -c "... re.search ..."`.

## Error Handling

- If `DISCORD_TOKEN` is not set, exit 1 immediately.
- If category creation fails (e.g. already exists with that name), log the error and exit 1.
- If a channel creation fails, log and continue — partial results are better than nothing.
- On any failure, output the error JSON:
  ```json
  { "error": "<message>", "projectSlug": "<projectSlug>", "discord": { "channels": {} } }
  ```

## Notes

- Uses Discord REST API v10 directly via `Bash` — no MCP tools required.
- `DISCORD_TOKEN` and `DISCORD_GUILD_ID` are available as env vars in the container.
- Category name = `projectTitle`. Channel names are always `general`, `updates`, `dev`.
- This skill is called by `onboard_project` Step 6 via A2A and should complete in <10s.
