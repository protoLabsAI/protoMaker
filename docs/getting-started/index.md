# Getting Started

protoLabs is an AI development studio. You describe features. AI agents build them in isolated git branches and create PRs. You review and merge.

## How It Works

```
You create a feature → Agent claims it → Works in isolated branch → Creates PR → You review & merge
```

1. **Describe what you want** — Create a feature on the board with a title and description
2. **Agent picks it up** — Auto-mode assigns an AI agent based on complexity
3. **Isolated execution** — The agent works in a git worktree, protecting your main branch
4. **PR for review** — When done, the agent creates a pull request
5. **Merge and ship** — Review the PR, merge it, feature moves to done

## Key Concepts

### Features

Features are units of work on the Kanban board. Each has a status:

| Status        | Meaning                     |
| ------------- | --------------------------- |
| `backlog`     | Queued, ready to start      |
| `in_progress` | Being worked on by an agent |
| `review`      | PR created, under review    |
| `blocked`     | Temporarily halted          |
| `done`        | PR merged, work complete    |

### Agents

AI agents powered by Claude execute features. Different models handle different complexity levels:

| Model  | Best For                            |
| ------ | ----------------------------------- |
| Haiku  | Small tasks, docs, quick fixes      |
| Sonnet | Standard features (default)         |
| Opus   | Architectural work, complex changes |

### Worktrees

Every feature runs in an isolated [git worktree](https://git-scm.com/docs/git-worktree). This means agents can work on multiple features simultaneously without conflicts, and your main branch stays clean.

## Next Steps

- **[Installation (Fedora/RHEL)](./installation-fedora)** — Install the desktop app on Linux
- **[Deployment Options](/infra/deployment)** — Docker, systemd, and staging setups
- **[Agent System](/agents/)** — Deep dive into how agents work
- **[MCP Plugin](/integrations/claude-plugin)** — Control protoLabs from Claude Code CLI
