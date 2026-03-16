# GitHub & CodeRabbit

protoLabs integrates deeply with GitHub to automate the full PR lifecycle — from branch creation to merge — and with CodeRabbit to provide AI-assisted code review with automatic thread resolution.

## Prerequisites

- GitHub account with access to your repository
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated
- Repository access with permission to create PRs and manage branches

## Setup

### 1. Authenticate the GitHub CLI

protoLabs uses the `gh` CLI for all GitHub operations. Authenticate once and the token is reused automatically:

```bash
gh auth login
```

Select **GitHub.com**, choose **HTTPS**, and authenticate via browser or token.

### 2. Set the GH_TOKEN environment variable

After authenticating, export the token to your environment:

```bash
# Add to your .env file
GH_TOKEN=$(gh auth token)
```

Or set it manually with a [Personal Access Token](https://github.com/settings/tokens):

```bash
GH_TOKEN=ghp_your_token_here
```

### 3. Required token scopes

| Scope      | Required | Purpose                                         |
| ---------- | -------- | ----------------------------------------------- |
| `repo`     | ✅ Yes   | Create/merge PRs, read branches, manage reviews |
| `workflow` | ✅ Yes   | Read CI workflow run status                     |
| `read:org` | Optional | Access organization-owned repositories          |

> **Note:** `GH_TOKEN` is the primary variable used for PR operations and CodeRabbit integration. `GITHUB_TOKEN` (commented out in `.env.example`) is used only for optional repository-dispatch and Langfuse sync features.

### 4. Verify the token

Check that protoLabs can reach GitHub:

```bash
gh auth status
```

You can also use the setup health check endpoint: `GET /api/setup/gh-status`

---

## Configuration

### Environment variables

| Variable       | Required | Description                                                     |
| -------------- | -------- | --------------------------------------------------------------- |
| `GH_TOKEN`     | ✅ Yes   | GitHub token for PR operations, reviews, and CodeRabbit threads |
| `GITHUB_TOKEN` | Optional | Alternative token for repository-dispatch / Langfuse sync only  |

Both variables are set in your project's `.env` file (see `.env.example` for the full template).

---

## What protoLabs does automatically

Once `GH_TOKEN` is configured and an agent completes a feature, the following steps happen without manual intervention:

### Overall flow

```
Agent finishes feature
        │
        ▼
 Create worktree branch
 Commit & push changes
        │
        ▼
  Open pull request
  (title + body generated)
        │
        ▼
  Poll CI checks (60s)  ──── timeout (10 min) ──▶ Escalate
        │
   CI passes
        │
        ▼
  resolve_pr_threads
  (auto-resolve bot threads)
        │
        ▼
  Poll review feedback ◀─────────────────────────┐
  (CodeRabbit, human)                             │
        │                                         │
  Feedback received?                              │
    ├─ No:  merge_pr ──▶ Done                     │
    └─ Yes: agent fixes  ─────(up to 2 iterations)┘
                │
           > 2 iterations ──▶ Escalate to EM agent
```

### Branch management

- Creates an isolated git worktree for each feature (`.worktrees/<feature-id>`)
- Commits changes to a feature branch named after the feature slug
- Pushes the branch to the remote repository

### PR creation

- Opens a pull request with a generated title and body summarizing the changes
- Sets the base branch from project settings (defaults to `main`)
- Adds labels and links the PR to the feature record

### Status checks and CI polling

- Polls GitHub for CI check results every 60 seconds (up to 10 minutes)
- Waits for all required status checks to pass before attempting merge
- Escalates to the EM agent if CI fails repeatedly

### Feedback loop

- Monitors open PRs for review comments (polling every 60 seconds)
- Detects: changes requested, inline comments, CodeRabbit feedback, approvals
- Passes feedback to the originating agent for autonomous remediation
- Limits remediation to **2 PR iterations** and **4 total remediation cycles** before escalating

---

## CodeRabbit

[CodeRabbit](https://coderabbit.ai) is an AI-powered code review tool that installs as a GitHub App and automatically reviews every pull request. protoLabs is aware of CodeRabbit and handles its feedback natively.

### What CodeRabbit does

- Posts line-level review comments on every PR
- Categorises issues by severity (nitpick, suggestion, issue)
- Opens review threads that must be resolved before merge (configurable)

### Installing the CodeRabbit GitHub App

1. Go to [coderabbit.ai](https://coderabbit.ai) and sign in with GitHub
2. Click **Add to GitHub** and select the repositories to enable
3. Accept the permissions (read/write access to pull requests and repository contents)
4. CodeRabbit begins reviewing PRs immediately — no additional configuration in protoLabs is required

A `.coderabbit.yaml` file in the repository root customises review behaviour (path filters, severity thresholds, language rules). protoLabs ships a default `.coderabbit.yaml` — edit it to tune review strictness.

### How resolve_pr_threads works

The `resolve_pr_threads` MCP tool (and the underlying `CodeRabbitResolverService`) automatically resolves review threads created by known bot accounts using GitHub's GraphQL `resolveReviewThread` mutation.

**Bots that are auto-resolved:**

| Bot account           | Description               |
| --------------------- | ------------------------- |
| `coderabbitai`        | CodeRabbit AI review bot  |
| `github-actions[bot]` | GitHub Actions automation |
| `dependabot[bot]`     | Dependency update bot     |
| `renovate[bot]`       | Renovate dependency bot   |

Human review threads are never auto-resolved — only threads created by the bot accounts above are eligible.

**When resolution runs:**

- Automatically during the PR merge flow, after CI passes and before the merge attempt
- On-demand via the `resolve_pr_threads` MCP tool

### How PRFeedbackService reads CodeRabbit comments

`PRFeedbackService` polls the GitHub API for review threads and passes them through `CodeRabbitParserService`, which:

1. Fetches all review threads on the PR
2. Identifies threads authored by `coderabbitai`
3. Parses the comment body for severity category, file path, and suggested change
4. Classifies threads as: **actionable** (the agent should fix) or **informational** (can be resolved without changes)
5. Includes the structured feedback in the agent's continuation prompt so it can address each item

The agent then decides whether to accept each feedback item. Accepted items trigger a new commit; resolved threads are marked via GraphQL.

---

## Available MCP tools

Seven MCP tools cover GitHub and CodeRabbit operations. See [MCP Tools Reference](../reference/mcp-tools.md#github-operations-7-tools) for full details.

| Tool                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `merge_pr`           | Merge an open pull request                        |
| `check_pr_status`    | Check PR status: CI checks, reviews, mergeability |
| `get_pr_feedback`    | Retrieve PR review feedback for the agent         |
| `resolve_pr_threads` | Resolve CodeRabbit and other bot review threads   |

---

## Troubleshooting

### PR creation fails with "authentication required"

**Symptom:** Agent log shows `gh pr create` failing or a 401 error from the GitHub API.

**Fix:**

1. Verify `GH_TOKEN` is set: `echo $GH_TOKEN`
2. Re-authenticate: `gh auth login`
3. Re-export the token: `GH_TOKEN=$(gh auth token)`
4. Confirm the token is in `.env` and the server has been restarted

---

### PR creation fails with "Resource not accessible by integration"

**Symptom:** 403 error when creating a PR or accessing reviews.

**Fix:** The token is missing required scopes. Generate a new Personal Access Token with `repo` and `workflow` scopes:

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select `repo` (full) and `workflow`
4. Copy the token and update `GH_TOKEN` in `.env`

---

### CI checks never complete / merge is blocked

**Symptom:** protoLabs waits for CI but the PR is never merged. Logs show repeated `Waiting for CI checks...`.

**Checks:**

- CI maximum wait is **10 minutes**. If your pipeline takes longer, the check times out and the PR is flagged for review.
- Verify the GitHub Actions workflow is actually running (check the **Actions** tab on the PR).
- If CI is passing but the check name doesn't match, ensure required status check names in branch protection match what the workflow reports.

---

### CodeRabbit threads are not being resolved

**Symptom:** After running `resolve_pr_threads`, CodeRabbit threads remain open.

**Checks:**

1. Confirm `GH_TOKEN` has `repo` scope (GraphQL mutations require it)
2. Verify the CodeRabbit bot account name is `coderabbitai` — custom installations may use a different handle
3. Check server logs for `CodeRabbitResolver` errors; a 401 or 403 indicates token scope issues
4. Threads created by **human reviewers** are intentionally left open

---

### Agent exceeds PR iteration limit

**Symptom:** Agent stops and an escalation is raised after two rounds of fixes.

**Behaviour:** protoLabs limits autonomous PR remediation to 2 iterations to prevent infinite loops. After the limit is reached, the feature is escalated to the EM agent for human review. Resolve the escalation and restart the agent to continue.

---

## Related Documentation

- [MCP Tools Reference](../reference/mcp-tools.md) — Full tool catalog including GitHub Operations
- [CI/CD](/self-hosting/ci-cd) — GitHub Actions pipeline configuration
