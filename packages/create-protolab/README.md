# create-protolab

A comprehensive CLI tool for setting up ProtoLab projects with Beads, Automaker, and Claude Code integration.

## Quick Start

```bash
# Initialize a new project with ProtoLab setup
npm run setup-lab -- /path/to/project

# Or run directly with bash
./scripts/setup-protolab.sh /path/to/project
```

The setup wizard will:

1. ✓ Validate prerequisites (git, CLI tools)
2. ✓ Initialize Beads issue tracker
3. ✓ Initialize Automaker structure
4. ✓ Install Automaker Claude Code plugin
5. ✓ Optionally configure CI/CD workflows

## Prerequisites

Before running the setup, ensure you have the following installed:

### Required Tools

- **git** (≥2.37.0) - Version control system
- **Node.js** (≥22.0.0) - JavaScript runtime
- **npm** (≥9.0.0) - Package manager

### Required CLI Tools

- **Claude CLI** (`claude`) - AI assistant for code
  - Install: https://claude.ai/code
  - Verify: `claude --version`

- **Beads CLI** (`bd`) - Issue tracking and task management
  - Install: https://github.com/jlowin/beads
  - Verify: `bd --version`

- **jq** - JSON processor
  - macOS: `brew install jq`
  - Linux: `apt-get install jq`
  - Windows: https://stedolan.github.io/jq/

### Optional Tools

- **gh CLI** - GitHub command-line interface
  - Install: https://cli.github.com
  - Verify: `gh --version`

- **gt CLI** - Git tooling (for advanced workflows)
  - Install: https://github.com/git-time-metric/gtm
  - Verify: `gt --version`

### Running Automaker Server

The setup script checks if the Automaker server is running on `http://localhost:3008`:

```bash
# In the Automaker repository
npm run dev
# or for production
npm run start
```

If the server is not running, you can continue the setup but may not be able to initialize the Automaker structure until the server is available.

## Common Workflows

### 1. Initial Project Setup

```bash
# Setup a new project from scratch
./scripts/setup-protolab.sh ~/my-project

# The setup will:
# - Initialize git (if not already a repo)
# - Create .beads/ directory for issue tracking
# - Create .automaker/ directory for feature management
# - Install the Claude Code plugin
# - Optionally setup CI/CD workflows
```

### 2. Reinitialize Beads or Automaker

If you need to reset Beads or Automaker:

```bash
# Answer 'y' when prompted during setup
./scripts/setup-protolab.sh ~/my-project
# When asked "Reinitialize?", respond with 'y'
```

### 3. Setup CI/CD Only

To setup CI/CD workflows without reinitializing Beads/Automaker:

```bash
./scripts/setup-ci-cd.sh /path/to/project
```

### 4. Verify Installation

```bash
# Check if all prerequisites are met
which claude
which bd
which jq
which gh

# Test Automaker connection
curl -s http://localhost:3008/api/health | jq '.'

# Verify project setup
cd /path/to/project
ls -la .beads/
ls -la .automaker/
```

### 5. Create Your First Feature

After setup is complete:

```bash
cd /path/to/project

# View the feature board
/board

# Create a new feature
/feature create "My first feature"

# Or use Beads for task tracking
bd create "Task name"
```

## Flags and Options

### Setup Script Flags

The setup script supports the following options:

```bash
# Skip confirmation prompts (useful for CI/CD)
./scripts/setup-protolab.sh /path/to/project --yes

# Dry run - show what would happen without making changes
./scripts/setup-protolab.sh /path/to/project --dry-run

# Skip CI/CD setup
./scripts/setup-protolab.sh /path/to/project --skip-cicd

# Output JSON format (for tooling integration)
./scripts/setup-protolab.sh /path/to/project --json
```

### Environment Variables

```bash
# Specify Automaker API key (if different from default)
AUTOMAKER_API_KEY=your-api-key ./scripts/setup-protolab.sh /path/to/project

# Specify Automaker server URL (default: http://localhost:3008)
AUTOMAKER_URL=http://automaker.example.com ./scripts/setup-protolab.sh /path/to/project

# Enable debug logging
DEBUG=true ./scripts/setup-protolab.sh /path/to/project
```

## Examples

### Example 1: Setup a New Python Project

```bash
# Create and setup project
mkdir ~/my-python-project
cd ~/my-python-project
git init

# Run setup
../../scripts/setup-protolab.sh .

# Create Python project structure
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create first feature
/feature create "Setup project structure"
```

### Example 2: Setup an Existing GitHub Repo

```bash
# Clone existing repository
git clone https://github.com/your-org/your-repo.git
cd your-repo

# Run setup
../scripts/setup-protolab.sh .

# Automaker will detect existing structure and setup appropriately
```

### Example 3: Setup with CI/CD in One Command

```bash
./scripts/setup-protolab.sh ~/my-project

# When prompted for CI/CD setup, answer 'y'
# This will:
# - Create GitHub Actions workflows
# - Setup branch protection
# - Configure automated testing
```

### Example 4: Batch Setup Multiple Projects (CI/CD)

```bash
#!/bin/bash
for project in ~/projects/*/; do
  echo "Setting up $project"
  AUTOMAKER_URL=http://automaker.company.com \
  ./scripts/setup-protolab.sh "$project" --yes --skip-cicd
done
```

## Troubleshooting

For detailed error resolution, see:

- **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[ERROR-CATALOG.md](./docs/ERROR-CATALOG.md)** - Complete error code reference

### Quick Troubleshooting

**Q: "git is not installed"**

- Install git: https://git-scm.com/download

**Q: "claude CLI is not installed"**

- Install: https://claude.ai/code
- Or: `npm install -g @anthropic-ai/claude-cli`

**Q: "Beads already initialized"**

- The script will ask if you want to reinitialize
- Or manually: `cd /path/to/project && bd init --force`

**Q: "Automaker server is not running"**

- Start the server: `cd ~/dev/automaker && npm run dev`
- Or continue setup without Automaker initialization

For more issues and solutions, see [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

## Development

To contribute to create-protolab or extend the setup process:

See **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)** for:

- How to add new gap checks
- How to add new template files
- How to test locally
- How to publish new versions

## File Structure

```
packages/create-protolab/
├── README.md                    # This file
├── docs/
│   ├── TROUBLESHOOTING.md      # Common issues and recovery steps
│   ├── ERROR-CATALOG.md        # Complete error code reference
│   └── DEVELOPMENT.md          # Development and contribution guide
└── scripts/
    └── setup-protolab.sh       # Main setup script
```

## Architecture

The setup process follows these phases:

1. **Validation Phase**
   - Check prerequisites (git, CLIs)
   - Verify project path exists
   - Check server availability

2. **Initialization Phase**
   - Initialize git repository (if needed)
   - Initialize Beads issue tracker
   - Initialize Automaker structure

3. **Plugin Phase**
   - Configure Claude Code plugin
   - Install/update Automaker plugin

4. **CI/CD Phase (Optional)**
   - Detect existing CI/CD setup
   - Create GitHub Actions workflows
   - Configure branch protection

## API Integration

The setup script uses these API endpoints:

### Health Check

```bash
GET /api/health
# Response: { "status": "ok", "version": "0.13.0" }
```

### Project Setup

```bash
POST /api/setup/project
Content-Type: application/json

{
  "projectPath": "/path/to/project"
}

# Response:
{
  "success": true,
  "projectPath": "/path/to/project",
  "filesCreated": ["path/to/file1", "path/to/file2"],
  "projectAdded": true
}
```

## Support

For issues and questions:

- GitHub Issues: https://github.com/your-org/automaker/issues
- Documentation: See docs/ directory
- Community: [Your community link]

## License

MIT - See LICENSE file in root repository

## Changelog

### v0.13.0

- Initial release
- Full setup workflow for ProtoLab projects
- Support for Beads and Automaker integration
- Claude Code plugin installation
- CI/CD workflow setup
