# create-protolab

CLI tool to initialize ProtoLab projects with comprehensive error handling and graceful degradation.

## Features

- **Comprehensive Error Handling**: Clear error messages with recovery suggestions
- **Graceful Degradation**: Optional tools (gh, gt, bd) gracefully skipped if missing
- **Rollback on Failure**: Automatic cleanup of partial changes on fatal errors
- **Idempotency**: Safe to run multiple times, detects existing setup
- **Permission Checks**: Verifies write access before making changes

## Installation

```bash
npm install -g create-protolab
```

## Usage

```bash
create-protolab <project-path> [options]
```

### Options

- `--force, -f`: Force reinitialize even if already set up
- `--verbose, -v`: Show detailed output
- `--yes, -y`: Skip all prompts

### Examples

```bash
# Basic initialization
create-protolab ./my-project

# Force reinitialize with verbose output
create-protolab ./my-project --force --verbose

# Skip all prompts
create-protolab ./my-project --yes
```

## Error Categories

### FATAL Errors

Cannot continue, will rollback changes:

- `NOT_GIT_REPO`: Not a git repository (run `git init` first)
- `NO_PACKAGE_JSON`: No package.json found
- `NO_WRITE_ACCESS`: No write permissions
- `INVALID_PROJECT_PATH`: Invalid project path

### RECOVERABLE Errors

Can skip and continue with remaining phases:

- `GH_CLI_MISSING`: GitHub CLI not found
- `GT_CLI_MISSING`: Graphite CLI not found
- `BD_CLI_MISSING`: Beads CLI not found
- `DISCORD_API_DOWN`: Discord API unavailable
- `GITHUB_API_RATE_LIMIT`: GitHub API rate limit exceeded
- `AUTOMAKER_SERVER_DOWN`: Automaker server not running

### WARNING

Non-critical issues:

- `ALREADY_INITIALIZED`: Setup already completed
- `CONFIG_EXISTS`: Configuration file exists
- `PARTIAL_SETUP`: Partial setup from previous run

## Setup Phases

1. **Validate Prerequisites**: Check environment and permissions
2. **Initialize Beads**: Set up Beads issue tracker (optional)
3. **Initialize Automaker**: Create `.automaker/` directory structure
4. **Setup CI/CD**: Configure GitHub Actions (optional)

## Requirements

### Required Tools

- `git`: Version control
- `node`: Node.js runtime (>=22.0.0)
- `npm`: Package manager
- `claude`: Claude CLI
- `jq`: JSON processor

### Optional Tools

- `gh`: GitHub CLI (for GitHub integration)
- `bd`: Beads CLI (for issue tracking)
- `gt`: Graphite CLI (for stacking workflow)

## Directory Structure

After successful setup:

```
project/
├── .automaker/
│   ├── features/       # Feature definitions
│   ├── context/        # AI agent context
│   ├── worktrees/      # Git worktree metadata
│   ├── backlog/        # Feature backlog
│   └── settings.json   # Project settings
├── .beads/             # Beads issue tracker (optional)
└── package.json
```

## Error Handling

The CLI provides clear error messages with recovery suggestions:

```
✗ [FATAL] Not a git repository

💡 Recovery: Run "git init" first to initialize a git repository
```

## Rollback

On fatal errors, the CLI automatically rolls back partial changes:

- Removes created directories
- Restores backed up files
- Cleans up incomplete setup

## Idempotency

Safe to run multiple times:

- Detects existing setup
- Resumes from incomplete setup
- Use `--force` to reinitialize

## Development

```bash
# Build the package
npm run build

# Watch mode
npm run dev

# Clean build artifacts
npm run clean
```

## License

MIT
