# ProtoLab Setup Guide

Complete guide for setting up a ProtoLab environment for any project.

## What is a ProtoLab?

A ProtoLab is a project workspace enhanced with:

- **Beads**: Git-backed issue tracker for task management
- **Automaker**: AI-powered feature development system
- **Claude Code Plugin**: MCP integration for programmatic control

## Quick Start

### 1. Prerequisites

Install required tools:

```bash
# Claude Code CLI
# Download from: https://claude.ai/code

# Beads CLI
brew install jlowin/tap/bd

# jq (JSON processor)
brew install jq

# Git (usually pre-installed)
git --version
```

### 2. Start Automaker Server

```bash
cd /path/to/automaker
npm run dev
```

Keep this running in a separate terminal.

### 3. Run Setup Script

```bash
cd /path/to/automaker
npm run setup-lab -- /path/to/your/project
```

**Example:**

```bash
npm run setup-lab -- ~/dev/my-app
```

### 4. Follow Post-Setup Steps

The script will display next steps when complete:

1. Open Claude Code in your project
2. Create your first feature
3. Create your first bead
4. Start building!

## What Gets Created

### Directory Structure

```
your-project/
├── .beads/                    # Beads issue tracker
│   ├── beads.db              # SQLite database
│   ├── issues.jsonl          # Git-trackable issue log
│   ├── config.yaml           # Beads configuration
│   └── README.md             # Beads documentation
├── .automaker/                # Automaker workspace
│   ├── features/             # Feature definitions
│   ├── context/              # Context files for AI agents
│   │   └── CLAUDE.md         # Project-specific instructions
│   └── memory/               # Agent memory storage
├── protolab.config           # ProtoLab configuration
└── [your existing files]
```

### Configuration Files

**protolab.config**

```json
{
  "name": "your-project",
  "version": "0.1.0",
  "protolab": {
    "enabled": true
  },
  "settings": {}
}
```

**CLAUDE.md** (generated template)

- Project overview
- Guidelines
- Common commands
- Architecture notes
- Development workflow

## Using Your ProtoLab

### Beads (Task Management)

**Create a task:**

```bash
cd your-project
bd create "Implement user authentication"
```

**List tasks:**

```bash
bd list
```

**View task details:**

```bash
bd show <task-id>
```

**Close a task:**

```bash
bd close <task-id>
```

**Add dependencies:**

```bash
bd dep add <task-id> --blocks <other-task-id>
```

### Automaker (Feature Development)

**View the board:**
Open Claude Code in your project and run:

```
/board
```

**Create a feature:**

```
/board
# Then click "Create Feature" in the UI
```

**Start auto-mode:**

```
/auto-mode start
```

Auto-mode will automatically:

- Pick up backlog features
- Respect dependencies
- Create git worktrees
- Run tests
- Create PRs

### Claude Code Integration

**Available commands:**

- `/board` - View and manage features
- `/auto-mode` - Start/stop autonomous processing
- `/context` - Manage context files
- `/orchestrate` - Manage feature dependencies

## Advanced Usage

### Custom Context Files

Add project-specific guidance for AI agents:

```bash
cd your-project/.automaker/context/
```

Create files like:

- `coding-standards.md` - Code style guidelines
- `git-workflow.md` - Branch and PR conventions
- `testing-requirements.md` - Test coverage rules
- `architecture.md` - System design notes

### Beads Configuration

Edit `.beads/config.yaml` to customize:

```yaml
prefix: your-project # Issue prefix
backend: sqlite # Storage backend
no-daemon: true # Disable daemon mode
```

### ProtoLab Configuration

Edit `protolab.config` to customize:

```json
{
  "name": "your-project",
  "version": "0.1.0",
  "protolab": {
    "enabled": true,
    "autoMode": {
      "maxConcurrency": 1,
      "autoStart": false
    },
    "beads": {
      "autoSync": true
    }
  },
  "settings": {
    "defaultModel": "sonnet",
    "testingRequired": true
  }
}
```

## Workflows

### Feature Development Workflow

1. **Create feature** on board
2. **Add dependencies** if needed
3. **Start auto-mode** or manually implement
4. **Review output** in UI
5. **Test changes** in git worktree
6. **Merge PR** when complete

### Task Management Workflow

1. **Create beads** for tasks
2. **Set dependencies** between tasks
3. **Assign to agents** or self
4. **Track progress** with bd list
5. **Close beads** when done

### Hybrid Workflow (Recommended)

Use **beads for operational tasks** (infrastructure, planning, documentation) and **Automaker features for code implementation**.

**Example:**

```bash
# Operational task in beads
bd create "Set up CI/CD pipeline"

# Code implementation in Automaker
# Use /board to create "Implement user auth" feature
```

## Troubleshooting

### Setup Script Fails

**Error: "Automaker server is not running"**

```bash
cd /path/to/automaker
npm run dev
```

**Error: "bd: command not found"**

```bash
brew install jlowin/tap/bd
```

**Error: "jq: command not found"**

```bash
brew install jq
```

### Beads Issues

**Run diagnostics:**

```bash
cd your-project
bd doctor
```

**Fix common issues:**

```bash
bd doctor --fix
```

**Common warnings:**

- Missing git hooks - Run `bd doctor --fix`
- CLI version outdated - Run `brew upgrade bd`
- Uncommitted changes - Commit or stash changes

### Automaker Issues

**Server won't start:**

- Check Node.js version: `node --version` (need >= 22.0.0)
- Check port 3008 isn't in use: `lsof -i :3008`
- Check logs in terminal where server is running

**Plugin not working:**

```bash
# Update plugin
claude plugin update automaker

# Reinstall plugin
claude plugin uninstall automaker
claude plugin install automaker
```

**Features not showing:**

- Restart Claude Code
- Check `.automaker/features/` directory exists
- Verify project is in Automaker settings

## Best Practices

### 1. Keep Context Files Updated

Update `.automaker/context/CLAUDE.md` as your project evolves:

- Add new commands
- Document architectural changes
- Update guidelines

### 2. Use Dependencies

Link related beads and features:

```bash
# Bead dependencies
bd dep add protolabs-ai-abc123 --blocks protolabs-ai-def456

# Feature dependencies
# Use /orchestrate in Claude Code
```

### 3. Commit Regularly

Both beads and Automaker work better with frequent commits:

```bash
git add .
git commit -m "feat: implement user auth"
```

### 4. Review Agent Output

Always review what agents produce:

- Check worktrees before merging
- Run tests locally
- Verify changes align with requirements

### 5. Clean Up Worktrees

Periodically clean up merged worktrees:

```bash
git worktree list
git worktree remove .worktrees/feature-name
```

## Next Steps

- Read `docs/setuplab-audit.md` for improvement opportunities
- Check `packages/mcp-server/plugins/automaker/` for plugin documentation
- Join discussions at https://github.com/proto-labs-ai/automaker

## Support

- **Issues**: https://github.com/proto-labs-ai/automaker/issues
- **Discussions**: https://github.com/proto-labs-ai/automaker/discussions
- **Discord**: [Join our server]

---

**Happy building! 🚀**
