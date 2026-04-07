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
  - mcp__plugin_protolabs_studio__setup_lab
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

## Step 6 — Chain to provision_discord via A2A

`provision_discord` needs Discord MCP tools not available in the native execution path.
Call it via Ava's A2A endpoint using `Bash`:

```bash
A2A_PAYLOAD=$(python3 -c "
import json
payload = {
  'jsonrpc': '2.0',
  'id': 1,
  'method': 'message/send',
  'params': {
    'message': {
      'role': 'user',
      'parts': [{'kind': 'text', 'text': 'projectTitle=<repoName> projectSlug=<projectSlug>'}]
    },
    'metadata': {'skillHint': 'provision_discord'}
  }
}
print(json.dumps(payload))
")

A2A_RESULT=$(curl -sf -X POST "http://localhost:${PORT:-3008}/a2a" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${AUTOMAKER_API_KEY}" \
  -d "$A2A_PAYLOAD" 2>&1)
echo "provision_discord A2A result: $A2A_RESULT"
```

Parse channel IDs from the A2A response:

```bash
CHANNELS=$(echo "$A2A_RESULT" | python3 -c "
import sys, json, re
try:
    d = json.load(sys.stdin)
    text = ''
    for artifact in d.get('result', {}).get('artifacts', []):
        for part in artifact.get('parts', []):
            if part.get('kind') == 'text':
                text += part.get('text', '')
    # provision_discord returns a JSON block with discord.channels
    m = re.search(r'\{[^{}]*\"discord\"[^{}]*\{[^{}]*\"channels\"[^{}]*\}[^{}]*\}', text, re.DOTALL)
    if m:
        ch = json.loads(m.group(0))
        print(json.dumps(ch.get('discord', {}).get('channels', {})))
    else:
        print('{}')
except Exception as e:
    print('{}')
" 2>/dev/null || echo '{}')
echo "Provisioned channels: $CHANNELS"
```

If the A2A call fails or returns empty channels `{}`, log a warning and continue —
Discord provisioning is not blocking for project onboarding.

## Step 7 — Write Discord Channel IDs Back to settings.json

After receiving the provision result, read the current `.automaker/projects/{projectSlug}/settings.json`,
and update `integrations.discord` with the returned channel IDs and webhook URL:

```json
{
  "integrations": {
    "discord": {
      "channels": {
        "dev": "<returned dev channel ID>",
        "release": "<returned release channel ID>"
      },
      "webhooks": {
        "release": "<returned release webhook URL>"
      }
    }
  }
}
```

Write the updated settings.json back to disk.

## Step 8 — Register Project in protoLabs Studio

Call `setup_lab` to initialize `.automaker/` in the cloned repo and register it in the
UI project switcher (writes to the global settings volume). This is what makes the project
appear in the app list.

```
mcp__plugin_protolabs_studio__setup_lab({
  projectPath: "/home/josh/dev/labs/<repoName>"
})
```

If `setup_lab` is not available (e.g. running from a context without the MCP server),
fall back to the REST endpoint:

```bash
SETUP_RESULT=$(curl -sf -X POST "http://localhost:${PORT:-3008}/api/setup/project" \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"${HOME}/dev/labs/<repoName>\"}" 2>&1)
echo "Setup result: $SETUP_RESULT"
```

If Step 0 (clone) failed and the path doesn't exist, log a warning and continue —
the user can register manually by opening protoLabs Studio and adding the project path.

## Step 9 — Create Plane Project

Create a corresponding Plane project so the repo appears in the strategic layer.

```bash
PLANE_RESULT=$(infisical run --domain https://secrets.proto-labs.ai/api --env=prod -- bash -c '
  curl -sf -X POST "http://ava:3002/api/v1/workspaces/protolabsai/projects/" \
    -H "X-Api-Key: ${PLANE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"<repoMeta.name>\",
      \"identifier\": \"<3-5 char uppercase abbreviation of project name>\",
      \"description\": \"<repoMeta.description>\",
      \"network\": 2
    }" 2>&1
')
PLANE_PROJECT_ID=$(echo "$PLANE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
echo "Plane project ID: $PLANE_PROJECT_ID"
```

If the call succeeds, write `plane_project_id` to the project's settings.json:

```json
{
  "integrations": {
    "plane": {
      "projectId": "<PLANE_PROJECT_ID>",
      "identifier": "<identifier used above>"
    }
  }
}
```

Also update `workspace/projects.yaml` entry (in Step 10 below) to include:

```yaml
plane:
  projectId: <PLANE_PROJECT_ID>
  identifier: <identifier>
```

If the Plane API call fails (Plane not available, auth error), log a warning and continue — Plane integration is non-blocking.

## Step 10 — Append Entry to workspace/projects.yaml

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
      dev: <dev channel ID>
      release: <release channel ID>
    webhooks:
      release: <release webhook URL>
  plane:
    projectId: <PLANE_PROJECT_ID or "not provisioned">
    identifier: <identifier or "not provisioned">
```

Read the file first. If it already contains a `slug: <projectSlug>` entry, update it
in-place instead of appending.

## Step 11 — Kickoff Message

The `provision_discord` subskill (Step 6) sends the kickoff message to the project's
#dev channel as part of its own execution. No additional action needed here if Step 6
succeeded.

If Step 6 failed or was skipped, log: "Kickoff message skipped — provision_discord
did not run. Post manually to the project's #dev channel once Discord is provisioned."

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
Plane: <project ID or "skipped — Plane not available">
protoLabs Studio: registered (or "skipped — path not cloned")
Routing index: workspace/projects.yaml updated
Kickoff message: posted
```

## Error Handling

- If GitHub API returns 404 for the repo slug, stop and report: "Repo <owner>/<repo> not found or not accessible."
- If any file write fails, report the specific step and error.
- If Discord provisioning fails, log a warning but continue to Steps 10 and 11.
- If Plane project creation fails (Step 9), log a warning and continue — Plane integration is non-blocking.
- If `workspace/projects.yaml` cannot be written, report it but do not block the Discord kickoff.
- If the setup endpoint call fails (Step 8), log a warning — the project is still partially onboarded and can be registered manually in the UI.

## Notes

- The target repo IS cloned locally to `~/dev/labs/<repoName>` (Step 0). This is required
  for `setup_lab` to initialize `.automaker/` and register the app in the UI.
- The target repo's `.gitignore` and `worktree-init` script are written via GitHub API
  (not local filesystem writes) so they are committed to the repo.
- Always derive `projectSlug` deterministically from `repoOwner/repoName`.
