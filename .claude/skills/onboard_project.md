---
name: onboard_project
description: Onboard a new GitHub repository into protoLabs Studio. Fetches repo metadata, scaffolds .automaker project files, provisions Discord channels, updates the workspace routing index, and posts a kickoff message.
category: ops
argument-hint: '<owner>/<repo> (e.g. protoLabsAI/protoWorkstacean)'
allowed-tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Write
  - Bash
  - WebFetch
  - WebSearch
  - Task
---

# onboard_project — New Repo Onboarding Skill

**EXECUTE IMMEDIATELY. DO NOT ASK ANY QUESTIONS. DO NOT CHECK MEMORY FIRST.**

All information is derived from the repo slug and GitHub API. Every unknown has a
hard-coded default below. Start executing Step 0 right now.

## Tooling

- **GitHub API**: use `gh api` via the `Bash` tool. `gh` is installed and authenticated.
  Example: `gh api repos/protoLabsAI/quinn --jq '.name'`
- **Filesystem**: use `Read`, `Write`, `Edit`, `Bash` for local file operations.
- No MCP tools required — all steps use `gh` CLI and direct file writes.

## Hard-Coded Defaults (never ask — always use these)

| What agent might ask          | Answer                                            |
| ----------------------------- | ------------------------------------------------- |
| Where is the repo cloned?     | `~/dev/labs/{repoName}` — clone it if missing     |
| What is the project?          | Fetch README from GitHub API                      |
| What is the branch strategy?  | `feature/* → dev → staging → main`                |
| What is the onboarding scope? | Full — features, bugs, roadmap, auto-mode capable |
| Any existing work to capture? | Check open GitHub issues/PRs via API              |
| What model tier?              | sonnet                                            |

## Input

You receive a GitHub repo slug: `<owner>/<repo>` (e.g. `protoLabsAI/quinn`).

Derive immediately — no questions:

- `repoOwner` — e.g. `protoLabsAI`
- `repoName` — e.g. `quinn`
- `projectPath` — **always** `~/dev/labs/{repoName}` e.g. `~/dev/labs/quinn`
- `projectSlug` — `${repoOwner}-${repoName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')

## Step 0 — Clone Repo if Not Present

```bash
if [ ! -d ~/dev/labs/<repoName>/.git ]; then
  mkdir -p ~/dev/labs
  git clone <cloneUrl> ~/dev/labs/<repoName>
  echo "Cloned to ~/dev/labs/<repoName>"
else
  echo "Already present at ~/dev/labs/<repoName>"
fi
```

If clone fails, log the error and continue — all remaining steps use GitHub API.

## Step 1 — Fetch GitHub Repo Metadata

Use the GitHub API to read the repo:

```bash
gh api repos/<owner>/<repo> --jq '{name: .name, description: .description, defaultBranch: .default_branch, htmlUrl: .html_url, cloneUrl: .clone_url}'
```

If `gh` is unavailable, use the REST API directly:

```bash
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/<owner>/<repo> \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'name':d['name'],'description':d.get('description',''),'defaultBranch':d['default_branch'],'htmlUrl':d['html_url'],'cloneUrl':d['clone_url']}))"
```

Store: `repoMeta = { name, description, defaultBranch, htmlUrl, cloneUrl }`.

## Step 1b — Fetch README for Project Context

```bash
gh api repos/<owner>/<repo>/readme --jq '.content' | base64 -d 2>/dev/null | head -100
```

Use the README content to populate `repoMeta.description` if the API description is blank,
and to understand the project's purpose for the kickoff message. If README is missing,
use the API description. Do not ask the user — derive everything from what's in the repo.

## Step 2 — Scaffold .automaker/projects/{projectSlug}/project.json

Determine `automakerRoot` — the `.automaker/` directory of the **current** protoLabs Studio
project (the one running this agent). Resolve it from the project path you are running
within (the parent of `.automaker/`).

Create the directory: `.automaker/projects/{projectSlug}/`

Write `.automaker/projects/{projectSlug}/project.json`:

```json
{
  "slug": "<projectSlug>",
  "title": "<repoMeta.name>",
  "description": "<repoMeta.description>",
  "status": "active",
  "createdAt": "<ISO timestamp>",
  "projectPath": "~/dev/labs/<repoName>",
  "github": {
    "owner": "<repoOwner>",
    "repo": "<repoName>",
    "defaultBranch": "<repoMeta.defaultBranch>",
    "htmlUrl": "<repoMeta.htmlUrl>"
  }
}
```

## Step 3 — Write .automaker/projects/{projectSlug}/settings.json

Write `.automaker/projects/{projectSlug}/settings.json`:

```json
{
  "projectSlug": "<projectSlug>",
  "integrations": {
    "github": {
      "repos": [
        {
          "owner": "<repoOwner>",
          "repo": "<repoName>",
          "defaultBranch": "<repoMeta.defaultBranch>",
          "cloneUrl": "<repoMeta.cloneUrl>"
        }
      ]
    },
    "discord": {
      "channels": {}
    }
  }
}
```

Leave `integrations.discord.channels` empty — it will be populated in Step 7.

## Step 4 — Ensure .automaker/ is in the Target Repo's .gitignore

Check whether the target repo's `.gitignore` already includes `.automaker/`:

```bash
gh api repos/<owner>/<repo>/contents/.gitignore \
  --jq '.content' | base64 -d | grep -q "^\.automaker/" && echo "present" || echo "missing"
```

If **missing**, append `.automaker/` to the file and commit it directly to the default branch:

```bash
# Get current file SHA (required for update)
SHA=$(gh api repos/<owner>/<repo>/contents/.gitignore --jq '.sha')
CURRENT=$(gh api repos/<owner>/<repo>/contents/.gitignore --jq '.content' | base64 -d)
NEW_CONTENT=$(printf '%s\n.automaker/\n' "$CURRENT" | base64 -w 0)

gh api repos/<owner>/<repo>/contents/.gitignore \
  -X PUT \
  -f message="chore: add .automaker/ to .gitignore" \
  -f content="$NEW_CONTENT" \
  -f sha="$SHA" \
  -f branch="<repoMeta.defaultBranch>"
```

If `.gitignore` does not exist in the repo yet, create it:

```bash
CONTENT=$(printf '.automaker/\n' | base64 -w 0)
gh api repos/<owner>/<repo>/contents/.gitignore \
  -X PUT \
  -f message="chore: add .gitignore with .automaker/" \
  -f content="$CONTENT" \
  -f branch="<repoMeta.defaultBranch>"
```

## Step 5 — Create Worktree Init Script in Target Repo

Create `.automaker/settings/worktree-init` in the **target repo** via GitHub API.

The script auto-detects the package manager and runs the appropriate install command:

```bash
#!/usr/bin/env bash
# .automaker/settings/worktree-init
# Auto-generated by protoLabs Studio onboard_project skill.
# Run after checking out a worktree to install dependencies.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [ -f "pnpm-workspace.yaml" ] || [ -f ".npmrc" ] && grep -q "shamefully-hoist\|node-linker" .npmrc 2>/dev/null; then
  echo "[worktree-init] Detected pnpm workspace"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
elif [ -f "pnpm-lock.yaml" ]; then
  echo "[worktree-init] Detected pnpm (lockfile)"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
elif [ -f "yarn.lock" ]; then
  echo "[worktree-init] Detected yarn"
  yarn install --frozen-lockfile 2>/dev/null || yarn install
elif [ -f "Cargo.toml" ]; then
  echo "[worktree-init] Detected Cargo (Rust)"
  cargo fetch
elif [ -f "go.mod" ]; then
  echo "[worktree-init] Detected Go modules"
  go mod download
elif [ -f "requirements.txt" ]; then
  echo "[worktree-init] Detected pip"
  pip install -r requirements.txt
elif [ -f "package-lock.json" ] || [ -f "package.json" ]; then
  echo "[worktree-init] Detected npm"
  npm ci 2>/dev/null || npm install
else
  echo "[worktree-init] No recognized package manager found. Skipping install."
fi

echo "[worktree-init] Done."
```

Upload via GitHub API:

```bash
SCRIPT_CONTENT=$(cat <<'SCRIPT'
#!/usr/bin/env bash
# .automaker/settings/worktree-init
# ... (script body above) ...
SCRIPT
)
ENCODED=$(printf '%s' "$SCRIPT_CONTENT" | base64 -w 0)

gh api repos/<owner>/<repo>/contents/.automaker/settings/worktree-init \
  -X PUT \
  -f message="chore: add .automaker/settings/worktree-init" \
  -f content="$ENCODED" \
  -f branch="<repoMeta.defaultBranch>"
```

## Step 6 — Chain to provision_discord

Call `mcp__plugin_protolabs_studio__provision_discord` with:

- `projectPath` — the current project path (automakerRoot's parent)
- `projectName` — `repoMeta.name`
- `guildId` — the Discord Guild ID from settings (`DISCORD_GUILD_ID` env or `1070606339363049492`)

Capture the result. Expected shape:

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

If `provision_discord` is not available or fails, log a warning and continue — Discord
provisioning is not blocking for project onboarding.

## Step 7 — Write Discord Channel IDs Back to settings.json

After receiving the provision result, read the current `.automaker/projects/{projectSlug}/settings.json`,
and update `integrations.discord.channels` with the returned channel names/IDs:

```json
{
  "integrations": {
    "discord": {
      "channels": {
        "general": "<returned general channel name or ID>",
        "updates": "<returned updates channel name or ID>",
        "dev": "<returned dev channel name or ID>"
      }
    }
  }
}
```

Write the updated settings.json back to disk.

## Step 8 — Append Entry to workspace/projects.yaml

The routing index lives at `workspace/projects.yaml` in the protoLabs Studio repo root.
If the file does not exist, create it with the header comment.

Append (or add to the `projects` list):

```yaml
- slug: <projectSlug>
  title: <repoMeta.name>
  github: <repoOwner>/<repoName>
  defaultBranch: <repoMeta.defaultBranch>
  status: active
  onboardedAt: <ISO timestamp>
  discord:
    channels:
      general: <general channel name or ID>
      updates: <updates channel name or ID>
      dev: <dev channel name or ID>
```

Read the file first. If it already contains a `slug: <projectSlug>` entry, update it
in-place instead of appending.

## Step 9 — Post Kickoff Message to #dev Channel

Send a kickoff message to the project's provisioned dev channel.

Use the `discord_send` tool with the dev channel from Step 6:

```
Project <repoMeta.name> is now onboarded to protoLabs Studio.

Repo: <repoMeta.htmlUrl>
Branch: <repoMeta.defaultBranch>
Slug: <projectSlug>

.automaker/ is excluded from git. Worktree init script is installed.
Discord channels are ready. Ready for agent work.
```

If the provisioned dev channel is not available (provision_discord failed or returned
no dev channel), fall back to posting to the global `#dev` channel (ID: `1469080556720623699`).

## Completion

After all steps, report:

```
onboard_project complete.

Project: <repoMeta.name> (<projectSlug>)
Repo: <repoOwner>/<repoName> (branch: <defaultBranch>)
Files created:
  - .automaker/projects/<projectSlug>/project.json
  - .automaker/projects/<projectSlug>/settings.json
Target repo:
  - .gitignore updated (or already had .automaker/)
  - .automaker/settings/worktree-init created
Discord: <provisioned channel names or "skipped">
Routing index: workspace/projects.yaml updated
Kickoff message: posted
```

## Error Handling

- If GitHub API returns 404 for the repo slug, stop and report: "Repo <owner>/<repo> not found or not accessible."
- If any file write fails, report the specific step and error.
- If Discord provisioning fails, log a warning but continue to Steps 8 and 9.
- If `workspace/projects.yaml` cannot be written, report it but do not block the Discord kickoff.

## Notes

- All filesystem operations happen in the **current** protoLabs Studio project (the one
  hosting this agent), not in the target repo (which is accessed via GitHub API).
- The target repo's `.gitignore` and `worktree-init` script are written via GitHub API.
- Never clone the target repo locally — all target repo writes go through the GitHub API.
- Always derive `projectSlug` deterministically from `repoOwner/repoName`.
