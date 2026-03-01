# Installation

## Prerequisites

- **Node.js 22+** (required: >=22.0.0 <23.0.0)
- **npm** (comes with Node.js)
- **Git** (for worktree isolation)
- **[Claude Code CLI](https://code.claude.com/docs/en/overview)** — Install and authenticate with your Anthropic subscription

protoLabs uses your authenticated Claude Code CLI credentials automatically. No separate API key configuration needed.

## Install

```bash
git clone https://github.com/proto-labs-ai/protolabs-studio.git
cd protolabs-studio
npm install
```

## Run

```bash
npm run dev
```

This opens an interactive launcher. Choose between:

1. **Web Application** — Opens in your browser at `localhost:3007`
2. **Desktop Application** — Electron app (recommended)

Or specify directly:

```bash
npm run dev:web              # Web browser mode
npm run dev:electron         # Desktop app
npm run dev:electron:debug   # Desktop with DevTools
npm run dev:electron:wsl     # WSL (Windows Subsystem for Linux)
```

## TUI Launcher

For a richer interactive menu:

```bash
./start-automaker.sh
```

Features: gradient ASCII art, pre-flight dependency checks, remembers your last choice (stored in `~/.automaker_launcher_history`), 30-second timeout for hands-free selection.

```bash
./start-automaker.sh web            # Direct launch — web
./start-automaker.sh electron       # Direct launch — desktop
./start-automaker.sh --check-deps   # Verify dependencies
./start-automaker.sh --help         # All options
```

## Authentication

protoLabs integrates with your authenticated Claude Code CLI. Install and authenticate following the [official quickstart](https://code.claude.com/docs/en/quickstart), then protoLabs detects your credentials automatically.

### API Key

The server uses `protoLabs_studio_key` as the default API key. To override, set the env var:

```bash
AUTOMAKER_API_KEY=your-custom-key npm run dev --workspace=apps/server
```

## Environment Variables

### Server

| Variable            | Default                | Description                   |
| ------------------- | ---------------------- | ----------------------------- |
| `PORT`              | `3008`                 | Server port                   |
| `HOST`              | `0.0.0.0`              | Host to bind to               |
| `HOSTNAME`          | `localhost`            | Hostname for user-facing URLs |
| `DATA_DIR`          | `./data`               | Data storage directory        |
| `AUTOMAKER_API_KEY` | `protoLabs_studio_key` | API key for server auth       |

### Security

| Variable                 | Default     | Description                                      |
| ------------------------ | ----------- | ------------------------------------------------ |
| `ALLOWED_ROOT_DIRECTORY` | _(none)_    | Restrict file operations to a specific directory |
| `CORS_ORIGIN`            | `localhost` | CORS allowed origins (comma-separated)           |

### Integrations

| Variable              | Default                      | Description                                 |
| --------------------- | ---------------------------- | ------------------------------------------- |
| `GITHUB_TOKEN`        | _(none)_                     | GitHub PAT for repository operations        |
| `LANGFUSE_PUBLIC_KEY` | _(none)_                     | Langfuse public key (enables observability) |
| `LANGFUSE_SECRET_KEY` | _(none)_                     | Langfuse secret key                         |
| `LANGFUSE_BASE_URL`   | `https://cloud.langfuse.com` | Langfuse API URL                            |

### Development

| Variable                         | Default  | Description                               |
| -------------------------------- | -------- | ----------------------------------------- |
| `VITE_SKIP_ELECTRON`             | _(none)_ | Skip Electron in dev mode                 |
| `OPEN_DEVTOOLS`                  | _(none)_ | Auto-open DevTools in Electron            |
| `AUTOMAKER_AUTO_LOGIN`           | _(none)_ | Skip login prompt (ignored in production) |
| `AUTOMAKER_MOCK_AGENT`           | _(none)_ | Enable mock agent mode for CI             |
| `AUTOMAKER_SKIP_SANDBOX_WARNING` | _(none)_ | Skip sandbox warning dialog               |

## Building

### Web Application

```bash
npm run build
```

### Desktop Application

```bash
npm run build:electron              # Current platform
npm run build:electron:mac          # macOS (DMG + ZIP, x64 + arm64)
npm run build:electron:win          # Windows (NSIS installer, x64)
npm run build:electron:linux        # Linux (AppImage + DEB + RPM, x64)
```

Output: `apps/ui/release/`

### Docker

See [Docker Architecture](../infra/docker.md) and [Docker Compose](../infra/docker-compose.md) for containerized deployment.

## Testing

```bash
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # Shared package tests
npm run test:all            # All tests (packages + server)
```

Tests run on ports 3007 (UI) and 3008 (server). Playwright uses Chromium and auto-starts test servers.

## Next Steps

Head to the [Quick Tutorial](./index.md#quick-tutorial) to create your first feature.
