# Installing protoLabs on Fedora/RHEL

This guide covers running protoLabs on Fedora, RHEL, Rocky Linux, AlmaLinux, and other RPM-based distributions.

protoLabs runs as a **server + web UI** (the primary way to use it) plus the `protomaker` CLI for driving the board from a terminal. There is also an optional **Tauri 2** desktop shell (`apps/desktop`) that wraps the same UI; it is built from source with the Rust toolchain rather than shipped as a prebuilt RPM. On Linux, most users run the server/UI and open the board in a browser.

## Prerequisites

protoLabs requires:

- **64-bit x86_64 architecture**
- **Fedora 39+** or **RHEL 9+** (earlier versions may work but are not officially supported)
- **4GB RAM minimum**, 8GB recommended
- **Internet connection** for installation and Claude API access
- **Node.js 22+** and **npm 10+** (the server and UI run on Node)
- **Git** (worktree-based agent execution requires it)

### Authentication

You'll need one of the following:

- **Claude CLI** (recommended) - `claude login`
- **API key** - Set `ANTHROPIC_API_KEY` environment variable

See the [installation guide authentication section](./installation.md#authentication) for details.

## Installation

protoLabs is installed from source. There is no prebuilt RPM package — the desktop shell is Tauri-based and built locally when you need it.

### 1. Install system dependencies

**Fedora:**

```bash
sudo dnf install nodejs npm git
```

**RHEL/CentOS (enable EPEL first if needed):**

```bash
sudo dnf install epel-release
sudo dnf install nodejs npm git
```

Verify Node.js is 22 or newer:

```bash
node --version   # should print v22.x or higher
```

### 2. Clone and build

```bash
# Clone repository
git clone https://github.com/protoLabsAI/protomaker.git
cd protomaker

# Install dependencies
npm install

# Build shared packages
npm run build:packages
```

### 3. Start the server and UI

```bash
npm run dev:full      # Starts UI (:3007) AND server (:3008) together
```

Then open `http://localhost:3007` in your browser. The backend API listens on `:3008` and the docs site (if running) on `:3009`.

## Running protoLabs

### Web UI

After `npm run dev:full`, open the board at `http://localhost:3007`.

### `protomaker` CLI

The `protomaker` CLI drives the board, agents, and auto-mode from a terminal. See [CLI Commands](../reference/cli-commands.md) for the full reference.

```bash
protomaker --help
```

If the `protomaker` command is not on your `PATH`, run it directly from the build output:

```bash
node packages/cli/dist/cli.js --help
```

### Desktop shell (optional, Tauri)

The desktop app is a [Tauri 2](https://v2.tauri.app/) shell around the same UI. Building it requires the Rust toolchain and the Tauri CLI in addition to Node.js:

```bash
# Install Rust (rustup) and the Tauri CLI prerequisites for your distro
# See https://v2.tauri.app/start/prerequisites/

cd apps/desktop
npm run build:desktop   # cargo tauri build
# or, for a live-reload dev window:
npm run dev             # cargo tauri dev
```

Tauri uses the system WebView (WebKitGTK) rather than bundling Chromium, so the dependency footprint is much smaller than a typical Electron app.

## System Requirements & Capabilities

### Hardware Requirements

| Component    | Minimum           | Recommended |
| ------------ | ----------------- | ----------- |
| CPU          | Modern multi-core | 4+ cores    |
| RAM          | 4GB               | 8GB+        |
| Disk         | 1GB               | 2GB+        |
| Architecture | x86_64            | x86_64      |

### Tauri desktop prerequisites

If you build the optional desktop shell, install the WebKitGTK toolchain Tauri needs:

**Fedora:**

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel
```

Follow the official [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/) for the exact package set on your distribution.

## Supported Distributions

**Officially Tested:**

- Fedora 39, 40 (latest)
- Rocky Linux 9
- AlmaLinux 9

**Should Work:**

- CentOS Stream 9+
- openSUSE Leap/Tumbleweed
- RHEL 9+

**Not Supported:**

- RHEL 8 (glibc 2.28 too old, requires Node.js 22)
- CentOS 7 and earlier
- Fedora versions older than 39

## Configuration

### Environment Variables

Set authentication via environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev:full
```

Or create a `.env` file in the repository root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Data Directory

protoLabs stores global data in the `DATA_DIR` directory (default `./data` in the repository, or `/data` in Docker):

```
data/settings.json          # Global settings, profiles, shortcuts
data/credentials.json       # API keys
data/agent-sessions/        # Conversation histories
```

Per-project data lives in each project's `.automaker/` directory.

## Troubleshooting

### Server Won't Start

**Check Node.js version:**

```bash
node --version   # must be v22+
```

**Run the server directly for error output:**

```bash
npm run dev:server
```

### Port Conflicts

protoLabs uses port 3008 for the server, 3007 for the UI, and 3009 for the docs site. If a port is already in use:

**Find the process using port 3008:**

```bash
sudo ss -tlnp | grep 3008
# or
lsof -i :3008
```

**Kill conflicting process (if safe):**

```bash
sudo kill -9 <PID>
```

Or set `PORT` to a different value (see Configuration section).

### Firewall Issues

On Fedora with firewalld enabled:

```bash
# Allow local UI/server traffic (local use only)
sudo firewall-cmd --add-port=3007/tcp --add-port=3008/tcp
sudo firewall-cmd --permanent --add-port=3007/tcp --add-port=3008/tcp
```

### Terminal/Worktree Issues

If a terminal session fails or git worktree operations hang:

1. Check disk space: `df -h`
2. Verify git installation: `git --version`
3. Check /tmp permissions: `ls -la /tmp`
4. File a GitHub issue with error output

### Network Issues

If Claude API calls fail:

```bash
# Test internet connectivity
ping -c 3 api.anthropic.com

# Test API access
curl -I https://api.anthropic.com

# Verify API key is set (without exposing the value)
[ -n "$ANTHROPIC_API_KEY" ] && echo "API key is set" || echo "API key is NOT set"
```

## Updating protoLabs

```bash
# Pull latest code
cd protomaker
git pull

# Reinstall dependencies and rebuild
npm install
npm run build:packages
```

## Getting Help

### Resources

- [Installation Guide](./installation.md) - Project overview and setup
- [CONTRIBUTING.md](https://github.com/protoLabsAI/protomaker/blob/main/CONTRIBUTING.md) - Contributing guide
- [GitHub Issues](https://github.com/protoLabsAI/protomaker/issues) - Bug reports & feature requests
- [Discussions](https://github.com/protoLabsAI/protomaker/discussions) - Questions & community

### Reporting Issues

When reporting Fedora/RHEL issues, include:

```bash
# System information
cat /etc/os-release
uname -m

# Node.js version
node --version

# Error output (run from terminal)
npm run dev:full 2>&1 | tee protomaker.log
```

## Performance Tips

1. **Use SSD**: Significantly improves worktree and build performance
2. **Close unnecessary applications**: Free up RAM for AI agent processing
3. **Keep system updated**: `sudo dnf update`
4. **Use latest Fedora/RHEL**: Newer versions have better Node.js support

## Security Considerations

### API Key Security

Never commit API keys to version control:

```bash
# Good: Use environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Good: Use .env file (not in git)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Bad: Hardcoded in any tracked file
```

### File Permissions

Ensure secret files are readable by your user only:

```bash
chmod 600 .env
chmod 700 data/
```

## Contributing

Found an issue or want to improve Linux support? See [CONTRIBUTING.md](https://github.com/protoLabsAI/protomaker/blob/main/CONTRIBUTING.md).
