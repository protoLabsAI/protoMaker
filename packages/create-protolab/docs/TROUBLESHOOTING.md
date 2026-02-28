# Troubleshooting Guide

This guide covers common errors and recovery steps for ProtoLab setup.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Git Issues](#git-issues)
3. [CLI Tool Issues](#cli-tool-issues)
4. [Server Connection Issues](#server-connection-issues)
5. [Beads Issues](#beads-issues)
6. [Automaker Issues](#automaker-issues)
7. [Plugin Installation Issues](#plugin-installation-issues)
8. [CI/CD Setup Issues](#cicd-setup-issues)
9. [Platform-Specific Issues](#platform-specific-issues)
10. [Recovery Procedures](#recovery-procedures)

---

## System Requirements

### Error: "Project path is required"

**Symptoms:** Script exits with error about missing project path

**Causes:**

- No path provided to setup script
- Path is empty or whitespace

**Fix:**

```bash
# Provide absolute or relative path
./scripts/setup-protolab.sh /path/to/project
# or
./scripts/setup-protolab.sh ./my-project
# or
./scripts/setup-protolab.sh ~/projects/my-project
```

### Error: "Directory does not exist"

**Symptoms:** Script says project directory doesn't exist

**Causes:**

- Path is typed incorrectly
- Directory was deleted
- Relative path resolves to wrong location

**Fix:**

```bash
# Verify path exists first
ls -la /path/to/project

# Create if missing
mkdir -p /path/to/project
cd /path/to/project

# Run setup
./scripts/setup-protolab.sh .
```

---

## Git Issues

### Error: "git is not installed"

**Symptoms:** E001 - git command not found

**Causes:**

- Git not installed on system
- Git not in PATH
- Git binary named differently

**Fix - macOS:**

```bash
# Install via Homebrew
brew install git

# Or install from: https://git-scm.com/download/mac
```

**Fix - Linux (Ubuntu/Debian):**

```bash
sudo apt-get update
sudo apt-get install git
```

**Fix - Linux (Fedora/RHEL):**

```bash
sudo dnf install git
```

**Fix - Windows:**

```bash
# Install from: https://git-scm.com/download/win
# Or via Chocolatey:
choco install git

# Or via Windows Package Manager:
winget install --id Git.Git -e --latest
```

**Verify Installation:**

```bash
git --version
# Should output: git version X.X.X
```

### Error: "Not a git repository"

**Symptoms:** E001 - Script can't find .git directory

**Causes:**

- Project directory is not initialized as git repo
- .git directory was deleted

**Fix:**

```bash
cd /path/to/project

# Initialize git repository
git init

# Or if this is a clone, verify .git exists
ls -la | grep .git

# Setup git user config if needed
git config user.email "you@example.com"
git config user.name "Your Name"

# Run setup again
../../scripts/setup-protolab.sh .
```

### Error: "No write access to directory" or "Permission denied"

**Symptoms:** E002 - Can't create .git directory or files

**Causes:**

- File permissions are too restrictive
- Project directory owned by different user
- On shared system or mounted drive

**Fix:**

```bash
# Check current user
whoami

# Check directory permissions
ls -la /path/to/project

# Make directory writable for current user
chmod u+w /path/to/project

# Or fix ownership
sudo chown -R $(whoami) /path/to/project

# Then run setup again
./scripts/setup-protolab.sh /path/to/project
```

---

## CLI Tool Issues

### Error: "claude CLI is not installed"

**Symptoms:** E003 - claude command not found

**Causes:**

- Claude CLI not installed
- Claude CLI not in PATH
- Version is incompatible

**Fix:**

```bash
# Install Claude CLI
# Option 1: From npm
npm install -g @anthropic-ai/claude-cli

# Option 2: From source
git clone https://github.com/anthropics/claude-cli.git
cd claude-cli
npm install -g .

# Option 3: Download binary from https://claude.ai/code

# Verify installation
claude --version
# Should output: claude version X.X.X

# Add to PATH if needed (check your shell config)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Error: "beads CLI (bd) is not installed"

**Symptoms:** E004 - bd command not found

**Causes:**

- Beads not installed
- Beads not in PATH
- Old/incompatible version

**Fix:**

```bash
# Install latest Beads
curl -fsSL https://get.beads.sh | bash

# Or via Homebrew (macOS)
brew install jlowin/tap/beads

# Or from source
git clone https://github.com/jlowin/beads.git
cd beads
cargo install --path .

# Verify installation
bd --version
# Should output: beads X.X.X
```

### Error: "jq is not installed"

**Symptoms:** E005 - jq command not found or JSON parsing fails

**Causes:**

- jq not installed
- jq not in PATH
- Incompatible version

**Fix - macOS:**

```bash
# Install via Homebrew
brew install jq

# Verify
jq --version
```

**Fix - Linux (Ubuntu/Debian):**

```bash
sudo apt-get install jq

# Verify
jq --version
```

**Fix - Linux (Fedora/RHEL):**

```bash
sudo dnf install jq

# Verify
jq --version
```

**Fix - Windows:**

```bash
# Via Chocolatey
choco install jq

# Or download from: https://stedolan.github.io/jq/
```

### Error: "gh CLI not found" (when using GitHub features)

**Symptoms:** GitHub-related features fail silently

**Causes:**

- gh not installed
- gh not configured with credentials

**Fix:**

```bash
# Install GitHub CLI
# macOS
brew install gh

# Linux
sudo apt-get install gh  # Debian/Ubuntu
sudo dnf install gh      # Fedora/RHEL

# Windows
choco install gh

# Configure with credentials
gh auth login

# Verify
gh --version
```

---

## Server Connection Issues

### Error: "Automaker server is not running"

**Symptoms:** E006 - Connection refused on localhost:3008

**Causes:**

- Automaker server not started
- Server running on different port
- Firewall blocking connection
- Server crashed

**Fix:**

```bash
# Start Automaker server (in automaker repo directory)
npm run dev

# Or in production mode
npm run start

# Test connection
curl -s http://localhost:3008/api/health | jq '.'

# If custom port/URL, set environment variable
AUTOMAKER_URL=http://localhost:3009 ./scripts/setup-protolab.sh /path/to/project
```

### Error: "Connection timeout or refused"

**Symptoms:** E007 - Timeout waiting for server response

**Causes:**

- Server is slow to respond
- Network connectivity issue
- Firewall configuration

**Fix:**

```bash
# Check if server is actually running
curl -v http://localhost:3008/api/health

# Check if port is in use
lsof -i :3008
# or
netstat -tuln | grep 3008

# If port in use by different process, kill it
kill -9 <PID>

# Start server again
npm run dev
```

### Error: "SSL/TLS certificate verification failed"

**Symptoms:** E008 - HTTPS connection fails

**Causes:**

- Self-signed certificate
- Certificate expired
- Certificate path issues

**Fix:**

```bash
# For development (self-signed certs)
AUTOMAKER_INSECURE=true ./scripts/setup-protolab.sh /path/to/project

# Or disable SSL verification
curl -k http://localhost:3008/api/health

# For production, ensure valid certificates are installed
```

---

## Beads Issues

### Error: "Beads already initialized in this project"

**Symptoms:** .beads/ directory already exists

**Causes:**

- Beads was already initialized
- Re-running setup on same project

**Fix:**

```bash
# Option 1: Reinitialize (answer 'y' when prompted)
./scripts/setup-protolab.sh /path/to/project

# Option 2: Manually reset beads
cd /path/to/project
rm -rf .beads/
bd init --prefix "$(basename $(pwd))" --no-daemon

# Option 3: Skip reinitialization (answer 'n' when prompted)
```

### Error: "Beads initialization failed"

**Symptoms:** E009 - bd init command exits with error

**Causes:**

- Beads version incompatible
- Directory permission issues
- Beads daemon crashed
- Disk full

**Fix:**

```bash
# Check beads status
bd status

# Kill any stray daemon processes
bd daemon stop
sleep 2

# Clear beads cache
rm -rf ~/.beads/cache

# Try initialization again
cd /path/to/project
bd init --force --no-daemon

# Check logs
bd logs
```

### Error: "Cannot read/write bead files"

**Symptoms:** E010 - Permission errors when accessing .beads/

**Causes:**

- Wrong file permissions
- Owner mismatch
- Mounted filesystem issues

**Fix:**

```bash
cd /path/to/project

# Fix permissions
chmod -R u+rw .beads/

# Or fix ownership
sudo chown -R $(whoami) .beads/

# Verify beads can write
bd create "test task"
bd list
```

---

## Automaker Issues

### Error: "Automaker initialization failed"

**Symptoms:** E011 - POST /api/setup/project returns error

**Causes:**

- Server error response
- Invalid project path
- Insufficient permissions
- Server crashed mid-request

**Fix:**

```bash
# Check server logs
curl -s http://localhost:3008/api/health | jq '.'

# Check response for details
curl -X POST http://localhost:3008/api/setup/project \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key" \
  -d '{"projectPath": "/path/to/project"}' | jq '.'

# Restart server
npm run dev

# Try again
./scripts/setup-protolab.sh /path/to/project
```

### Error: "Project already exists in settings"

**Symptoms:** Warning that project is already configured

**Causes:**

- Re-running setup on same project
- Project manually added to settings

**Fix:**

```bash
# This is usually safe to ignore
# Automaker will update configuration

# To remove and reinitialize:
# 1. Remove from Automaker settings (via UI or API)
# 2. Delete .automaker/ directory
cd /path/to/project
rm -rf .automaker/

# 3. Run setup again
../../scripts/setup-protolab.sh .
```

### Error: "Cannot create .automaker files"

**Symptoms:** E012 - Permission or I/O errors

**Causes:**

- Directory permissions
- Disk space issues
- Network mount problems

**Fix:**

```bash
cd /path/to/project

# Check disk space
df -h .

# Check permissions
ls -la | head -5

# Fix if needed
chmod u+w .

# Clear existing .automaker
rm -rf .automaker/

# Try setup again
../../scripts/setup-protolab.sh .
```

---

## Plugin Installation Issues

### Error: "Claude plugin marketplace not found"

**Symptoms:** E013 - Plugin marketplace add fails

**Causes:**

- Incorrect plugin path
- Plugin directory doesn't exist
- Claude CLI version incompatible

**Fix:**

```bash
# Verify plugin directory exists
ls -la /path/to/automaker/packages/mcp-server/plugins

# Manually add marketplace
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins

# Or reinstall Claude CLI
npm install -g @anthropic-ai/claude-cli@latest

# Verify
claude plugin marketplace list
```

### Error: "Cannot install Automaker plugin"

**Symptoms:** E014 - Plugin install/update fails

**Causes:**

- Plugin marketplace not configured
- Plugin has missing dependencies
- Claude version too old

**Fix:**

```bash
# Ensure marketplace is configured
claude plugin marketplace list

# Try manual install
claude plugin install protolabs

# Check plugin status
claude plugin list | grep protolabs

# If not found, rebuild from source
cd /path/to/automaker/packages/mcp-server
npm install
npm run build

# Try install again
claude plugin install protolabs
```

### Error: "Plugin version mismatch or incompatible"

**Symptoms:** E015 - Plugin loads but throws compatibility errors

**Causes:**

- Plugin version doesn't match server
- Claude CLI version too old
- Missing dependencies

**Fix:**

```bash
# Update Claude CLI
npm install -g @anthropic-ai/claude-cli@latest

# Update plugin
claude plugin update protolabs

# Or force reinstall
claude plugin uninstall protolabs
claude plugin install protolabs

# Check versions
claude --version
claude plugin list
```

---

## CI/CD Setup Issues

### Error: "GitHub API rate limited"

**Symptoms:** E016 - GitHub API requests fail

**Causes:**

- Too many API calls
- Not authenticated with gh
- IP-based rate limit

**Fix:**

```bash
# Authenticate with GitHub
gh auth login

# Wait for rate limit reset (typically 1 hour)

# Or set higher rate limits with token
gh auth token | gh api user

# Verify authentication
gh api user
```

### Error: "Cannot create GitHub Actions workflows"

**Symptoms:** E017 - Workflow file creation fails

**Causes:**

- Not authenticated with gh
- Not a GitHub repository
- Insufficient permissions

**Fix:**

```bash
# Ensure gh is authenticated
gh auth login

# Verify repository
git remote -v
# Should show github.com origin

# Check permissions
gh repo view

# Try CI/CD setup again
../../scripts/setup-ci-cd.sh /path/to/project
```

### Error: "Branch protection setup failed"

**Symptoms:** E018 - Cannot configure branch protection

**Causes:**

- Repository not on GitHub
- Insufficient permissions
- Branch doesn't exist

**Fix:**

```bash
# Ensure branch exists
git branch -a

# Check permissions on repository
gh repo view --web

# May need admin permissions
# Contact repository admin

# Try again
../../scripts/setup-ci-cd.sh /path/to/project
```

---

## Platform-Specific Issues

### macOS: "Operation not permitted" errors

**Symptoms:**

- Permission denied even as admin
- "not permitted" errors on .beads or .automaker

**Causes:**

- System Integrity Protection (SIP) restrictions
- Gatekeeper blocking tools
- Notarization issues

**Fix:**

```bash
# Check SIP status
csrutil status

# If restricted, may need to disable for certain operations
# (Not recommended - use proper permissions instead)

# Better: Use brew/proper installers
brew install git node jq

# Grant permissions to terminal app
# System Preferences → Security & Privacy → Privacy → Full Disk Access
```

### macOS: "arm64 vs x86_64" architecture mismatch

**Symptoms:**

- "cannot execute binary file"
- "wrong architecture"

**Causes:**

- Mixed 32-bit and 64-bit tools
- Node version mismatch
- Tool compiled for wrong architecture

**Fix:**

```bash
# Check current shell architecture
arch

# Check Node architecture
file $(which node)

# Reinstall Node with correct arch
arch -arm64 brew install node  # For Apple Silicon
# or
arch -x86_64 brew install node  # For Intel

# Or use nvm for version management
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22.0.0
```

### Windows: "Path not found" or "invalid path"

**Symptoms:**

- E019 - Windows path handling issues
- Forward slashes vs backslashes problems

**Causes:**

- UNIX paths in Windows shell
- Mixed path separators
- WSL vs native Windows confusion

**Fix:**

```bash
# Use absolute Windows paths with backslashes
set PROJECT_PATH=C:\Users\username\projects\my-project
.\scripts\setup-protolab.sh %PROJECT_PATH%

# Or use Git Bash (Unix-style paths work)
./scripts/setup-protolab.sh /c/Users/username/projects/my-project

# Or use WSL2 (recommended for developers)
wsl
./scripts/setup-protolab.sh ~/projects/my-project
```

### Windows: Line ending issues

**Symptoms:**

- Scripts exit with permission errors
- "command not found" on shell scripts

**Causes:**

- CRLF line endings (Windows) instead of LF (Unix)
- Git autocrlf setting

**Fix:**

```bash
# Configure git to preserve line endings
git config --global core.autocrlf input

# Or set for specific repository
cd /path/to/project
git config core.autocrlf false

# Convert existing files
dos2unix ./scripts/setup-protolab.sh

# Or using sed
sed -i 's/\r$//' ./scripts/setup-protolab.sh
```

### Linux: "Permission denied" on home directory

**Symptoms:**

- Cannot write to ~/.beads or ~/.claude

**Causes:**

- Restrictive home directory permissions
- SELinux policies
- User/group issues

**Fix:**

```bash
# Check home directory permissions
ls -la ~

# Should be 755 or 700
# If not, fix it
chmod 700 ~

# Check SELinux status
getenforce

# If enforcing, may need policy changes
# Or run as appropriate user
sudo semanage fcontext -a -t user_home_t "~/.beads(/.*)?"
restorecon -R ~/.beads
```

---

## Recovery Procedures

### Complete Reset

If setup is corrupted and you need to start fresh:

```bash
cd /path/to/project

# 1. Backup existing data
cp -r .beads .beads.backup 2>/dev/null || true
cp -r .automaker .automaker.backup 2>/dev/null || true

# 2. Remove existing setup
rm -rf .beads .automaker

# 3. Re-run setup
../../scripts/setup-protolab.sh .
```

### Partial Reset - Beads Only

```bash
cd /path/to/project

# Backup data
cp -r .beads .beads.backup

# Remove and reinitialize
rm -rf .beads
bd init --prefix "$(basename $(pwd))" --no-daemon
```

### Partial Reset - Automaker Only

```bash
cd /path/to/project

# Backup data
cp -r .automaker .automaker.backup

# Remove and reinitialize
rm -rf .automaker

# Call setup again
AUTOMAKER_URL=http://localhost:3008 curl -X POST http://localhost:3008/api/setup/project \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "'$(pwd)'"}'
```

### Debug Mode

Enable debug output for troubleshooting:

```bash
# Run with debug logging
DEBUG=true ./scripts/setup-protolab.sh /path/to/project

# Or increase verbosity
set -x  # In bash script
VERBOSE=1 ./scripts/setup-protolab.sh /path/to/project

# Check logs
cat ~/.beads/logs/latest.log
cat ~/.automaker/logs/setup.log
```

---

## Getting Help

If you still can't resolve the issue:

1. **Check error code** - See [ERROR-CATALOG.md](./ERROR-CATALOG.md) for complete reference
2. **Gather logs** - Run with DEBUG=true and save output
3. **Report issue** - Include:
   - Error code and message
   - Your OS and versions (git --version, node --version, etc.)
   - Full debug output
   - Steps to reproduce

4. **Useful debugging commands:**

   ```bash
   # System info
   uname -a
   node --version
   npm --version
   git --version

   # CLI status
   which claude bd jq gh

   # Service status
   curl -v http://localhost:3008/api/health

   # File status
   ls -la ~/.beads
   ls -la ~/.claude
   ls -la /path/to/project/.automaker
   ```
