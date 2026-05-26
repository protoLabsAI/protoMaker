# CLI Command Reference

Complete reference for the `protomaker` CLI. Every command supports the global flags `--json`, `--quiet`, and `--project <path>`.

## Global Flags

| Flag               | Description                              | Default         |
| ------------------ | ---------------------------------------- | --------------- |
| `--json`           | Output results as structured JSON        | `false`         |
| `--quiet`          | Suppress all non-error output            | `false`         |
| `--project <path>` | Project path (resolves config from here) | `process.cwd()` |

## Exit Codes

| Code | Meaning       | Example                                 |
| ---- | ------------- | --------------------------------------- |
| 0    | Success       | Command completed without errors        |
| 1    | Runtime error | Server returned error, network failure  |
| 2    | Usage error   | Missing required argument, invalid flag |

---

## `protomaker board`

Print a per-status summary of the feature board.

**Usage:**

```bash
protomaker board [global-flags]
```

**Output:** Text summary table (counts per status, WIP limits). Use `--json` for raw JSON.

---

## `protomaker query`

Query features with compound filters.

**Usage:**

```bash
protomaker query [options] [global-flags]
```

**Options:**

| Flag                    | Description        | Default |
| ----------------------- | ------------------ | ------- |
| `--status <status>`     | Filter by status   | —       |
| `--category <category>` | Filter by category | —       |
| `--assignee <assignee>` | Filter by assignee | —       |

**Valid statuses:** `backlog`, `in_progress`, `review`, `blocked`, `done`, `interrupted`

---

## `protomaker health`

Check server health status via `GET /health`.

**Usage:**

```bash
protomaker health [global-flags]
```

---

## `protomaker sitrep`

Show operational status report: board state, running agents, auto-mode status, open PRs, escalations, and server health.

**Usage:**

```bash
protomaker sitrep [options] [global-flags]
```

**Options:**

| Flag                    | Description            | Default |
| ----------------------- | ---------------------- | ------- |
| `--project-slug <slug>` | Filter by project slug | —       |

---

## `protomaker feature`

Core board commands — manage features.

### `feature list`

List all features grouped by status (board view).

**Usage:**

```bash
protomaker feature list [options] [global-flags]
```

**Options:**

| Flag                | Description                              | Default |
| ------------------- | ---------------------------------------- | ------- |
| `--status <status>` | Filter by status                         | —       |
| `--compact`         | Show compact one-line format (text mode) | —       |

### `feature get <featureId>`

Show full feature details.

**Usage:**

```bash
protomaker feature get <featureId> [global-flags]
```

### `feature create`

Create a new feature.

**Usage:**

```bash
protomaker feature create [options] [global-flags]
```

**Options:**

| Flag                   | Description                    | Default   |
| ---------------------- | ------------------------------ | --------- |
| `--description <text>` | Feature description (required) | —         |
| `--title <text>`       | Feature title                  | —         |
| `--category <text>`    | Feature category               | `feature` |
| `--complexity <level>` | Complexity level               | —         |
| `--priority <n>`       | Priority (1=urgent, 4=low)     | —         |
| `--epic-id <id>`       | Parent epic ID                 | —         |
| `--is-epic`            | Mark as epic container         | `false`   |

**Valid complexities:** `small`, `medium`, `large`, `architectural`

### `feature update <featureId>`

Update a feature's fields. At least one update flag is required.

**Usage:**

```bash
protomaker feature update <featureId> [options] [global-flags]
```

**Options:**

| Flag                   | Description          | Default |
| ---------------------- | -------------------- | ------- |
| `--title <text>`       | New title            | —       |
| `--description <text>` | New description      | —       |
| `--category <text>`    | New category         | —       |
| `--complexity <level>` | New complexity level | —       |
| `--priority <n>`       | New priority (1-4)   | —       |

### `feature move <featureId> <status>`

Transition a feature to a new status.

**Usage:**

```bash
protomaker feature move <featureId> <status> [options] [global-flags]
```

**Options:**

| Flag              | Description                                       | Default |
| ----------------- | ------------------------------------------------- | ------- |
| `--reason <text>` | Reason for status change (required when blocking) | —       |

**Valid statuses:** `backlog`, `in_progress`, `review`, `blocked`, `done`, `interrupted`

---

## `protomaker agent`

Manage AI agents and workflows.

### `agent start <featureId>`

Dispatch an agent to work on a feature.

**Usage:**

```bash
protomaker agent start <featureId> [options] [global-flags]
```

**Options:**

| Flag         | Description                             | Default |
| ------------ | --------------------------------------- | ------- |
| `--force`    | Skip dependency checks and start anyway | `false` |
| `--worktree` | Use git worktree isolation              | `false` |

### `agent stop <featureId>`

Stop a running agent for a specific feature.

**Usage:**

```bash
protomaker agent stop <featureId> [options] [global-flags]
```

**Options:**

| Flag                       | Description                       | Default |
| -------------------------- | --------------------------------- | ------- |
| `--target-status <status>` | Set feature status after stopping | —       |

### `agent list`

Show running agents.

**Usage:**

```bash
protomaker agent list [options] [global-flags]
```

**Options:**

| Flag              | Description           | Default |
| ----------------- | --------------------- | ------- |
| `--branch <name>` | Filter by branch name | —       |

### `agent output <featureId>`

Print the agent output (agent-output.md) for a feature.

**Usage:**

```bash
protomaker agent output <featureId> [global-flags]
```

### `agent message <featureId> <prompt>`

Send a follow-up message to a running agent.

**Usage:**

```bash
protomaker agent message <featureId> <prompt> [options] [global-flags]
```

**Options:**

| Flag             | Description                       | Default |
| ---------------- | --------------------------------- | ------- |
| `--image <path>` | Attach an image file (repeatable) | —       |

---

## `protomaker pr`

Pull request commands — create, check status, and merge PRs.

### `pr create <featureId>`

Open a PR from a feature worktree. Commits unpushed changes, pushes the branch, and creates (or reuses) the PR on GitHub.

**Usage:**

```bash
protomaker pr create <featureId> [options] [global-flags]
```

**Options:**

| Flag                      | Description                         | Default |
| ------------------------- | ----------------------------------- | ------- |
| `--commit-message <text>` | Commit message for unpushed changes | —       |
| `--pr-title <text>`       | Pull request title                  | —       |
| `--pr-body <text>`        | Pull request body                   | —       |
| `--base-branch <branch>`  | Target base branch                  | —       |
| `--draft`                 | Create as draft PR                  | `false` |

### `pr status <prNumber>`

Show CI rollup for a pull request (check statuses, ownership, staleness).

**Usage:**

```bash
protomaker pr status <prNumber> [global-flags]
```

### `pr merge <prNumber>`

Merge a PR with the configured strategy.

**Usage:**

```bash
protomaker pr merge <prNumber> [options] [global-flags]
```

**Options:**

| Flag                    | Description                              | Default  |
| ----------------------- | ---------------------------------------- | -------- |
| `--strategy <strategy>` | Merge strategy (merge, squash, rebase)   | `squash` |
| `--no-wait-for-ci`      | Do not wait for CI checks before merging | `false`  |

---

## `protomaker queue`

Manage the feature execution queue.

### `queue add <featureId>`

Add a feature to the execution queue (transition to backlog status).

**Usage:**

```bash
protomaker queue add <featureId> [global-flags]
```

### `queue list`

List features in the execution queue (backlog status).

**Usage:**

```bash
protomaker queue list [global-flags]
```

### `queue clear`

Clear all features from the execution queue (deletes backlog features).

**Usage:**

```bash
protomaker queue clear [options] [global-flags]
```

**Options:**

| Flag    | Description              | Default |
| ------- | ------------------------ | ------- |
| `--yes` | Skip confirmation prompt | `false` |

---

## `protomaker auto-mode`

Control the auto-mode loop.

### `auto-mode start`

Start the auto-mode loop for a project.

**Usage:**

```bash
protomaker auto-mode start [options] [global-flags]
```

**Options:**

| Flag                    | Description                        | Default |
| ----------------------- | ---------------------------------- | ------- |
| `--branch <name>`       | Branch name for worktree isolation | —       |
| `--max-concurrency <n>` | Max concurrent features (1-20)     | —       |

### `auto-mode stop`

Stop the auto-mode loop.

**Usage:**

```bash
protomaker auto-mode stop [options] [global-flags]
```

**Options:**

| Flag              | Description                        | Default |
| ----------------- | ---------------------------------- | ------- |
| `--branch <name>` | Branch name for worktree isolation | —       |

### `auto-mode status`

Show the current auto-mode status for a project.

**Usage:**

```bash
protomaker auto-mode status [options] [global-flags]
```

**Options:**

| Flag              | Description                        | Default |
| ----------------- | ---------------------------------- | ------- |
| `--branch <name>` | Branch name for worktree isolation | —       |

---

## `protomaker context`

Manage project context files.

### `context list`

List all context files in the project.

**Usage:**

```bash
protomaker context list [global-flags]
```

### `context get <filename>`

Read and display a context file.

**Usage:**

```bash
protomaker context get <filename> [global-flags]
```

**Filename rules:** Must end in `.md` or `.txt`.

### `context create <filename>`

Create a new context file. Reads content from stdin or `--content` option.

**Usage:**

```bash
protomaker context create <filename> [options] [global-flags]
```

**Options:**

| Flag               | Description                                | Default |
| ------------------ | ------------------------------------------ | ------- |
| `--content <text>` | Content to write (omit to read from stdin) | —       |

**Filename rules:** Must end in `.md` or `.txt`.

### `context delete <filename>`

Delete a context file.

**Usage:**

```bash
protomaker context delete <filename> [options] [global-flags]
```

**Options:**

| Flag    | Description              | Default |
| ------- | ------------------------ | ------- |
| `--yes` | Skip confirmation prompt | `false` |

**Filename rules:** Must end in `.md` or `.txt`.

---

## Command Summary

| Command                                      | Description                     |
| -------------------------------------------- | ------------------------------- |
| `board`                                      | Per-status board summary        |
| `query [--status] [--category] [--assignee]` | Query features with filters     |
| `health`                                     | Check server health             |
| `sitrep [--project-slug]`                    | Full operational status report  |
| `feature list [--status] [--compact]`        | List features grouped by status |
| `feature get <id>`                           | Show feature details            |
| `feature create --description ...`           | Create a new feature            |
| `feature update <id> --title ...`            | Update feature fields           |
| `feature move <id> <status>`                 | Transition feature status       |
| `agent start <id> [--force] [--worktree]`    | Dispatch an agent               |
| `agent stop <id> [--target-status]`          | Stop a running agent            |
| `agent list [--branch]`                      | Show running agents             |
| `agent output <id>`                          | Print agent output              |
| `agent message <id> <prompt> [--image]`      | Send follow-up to agent         |
| `pr create <id> [--commit-message] ...`      | Open a PR from a worktree       |
| `pr status <number>`                         | Show CI rollup for a PR         |
| `pr merge <number> [--strategy]`             | Merge a PR                      |
| `queue add <id>`                             | Add feature to queue            |
| `queue list`                                 | List queued features            |
| `queue clear [--yes]`                        | Clear the queue                 |
| `auto-mode start [--max-concurrency]`        | Start the auto-mode loop        |
| `auto-mode stop`                             | Stop the auto-mode loop         |
| `auto-mode status`                           | Show auto-mode status           |
| `context list`                               | List context files              |
| `context get <filename>`                     | Read a context file             |
| `context create <filename> [--content]`      | Create a context file           |
| `context delete <filename> [--yes]`          | Delete a context file           |
