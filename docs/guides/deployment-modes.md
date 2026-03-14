# Deployment Modes

protoLabs Studio supports three deployment modes depending on your use case.

---

## Mode 1: Standard Electron (Bundled Server)

The default desktop build. Bundles the backend server inside the Electron app and launches it automatically on startup.

**Build:**

```bash
npm run build:electron
```

**Run:** Double-click the produced `.dmg` / `.exe` / `.AppImage`.

**Characteristics:**

- Self-contained — no external server required.
- Server starts on a dynamically selected port (default 3008).
- API key is generated automatically for CSRF protection.
- Suitable for individual developers and standard desktop installs.

---

## Mode 2: Legless Electron (External Server — Shows Picker)

A slimmed-down Electron build that ships **without** the embedded server. On first launch it prompts the user to connect to a running Automaker server instance.

**Build:**

```bash
npm run build:electron:legless
```

**Characteristics:**

- `SKIP_EMBEDDED_SERVER=true` is baked in at build time.
- The `prepare-server.mjs` bundling step is skipped entirely (faster builds, smaller app).
- No `server-bundle` `extraResources` are included in the installer.
- On launch, a native dialog asks the user to confirm the server URL.
  - Default: `http://localhost:3008`
  - Override via `AUTOMAKER_SERVER_URL` environment variable before launching.
- Uses session-based authentication (same as web mode) — no embedded API key.
- Suitable for teams running a shared/remote Automaker server (VPS, LAN, Docker).

**Connect to a custom server:**

```bash
AUTOMAKER_SERVER_URL=http://192.168.1.50:3008 open protoLabs\ Studio.app
```

---

## Mode 3: Headless Server (No UI)

Run the Automaker backend server in production mode with auto-mode enabled and no Electron UI. Ideal for CI runners, servers, or agent-only workloads.

**Start:**

```bash
# From the repository root (runs built dist/index.js)
cd apps/server && npm run start:headless

# Or via workspace script
npm --workspace=apps/server run start:headless
```

**Characteristics:**

- `NODE_ENV=production` — production logging and behaviour.
- `AUTO_MODE=true` — agents start and operate without manual intervention.
- No Electron, no browser window, no UI dependencies.
- Exposes the same HTTP/WebSocket API as the bundled Electron server.
- Suitable for 24/7 agent servers, staging environments, and headless CI builds.

**Prerequisites:** Build the server first.

```bash
cd apps/server && npm run build
```

---

## Headless Example: proto.config.yaml with 2-Agent Defaults

Place `proto.config.yaml` in your project root (or the `DATA_DIR`) to configure the headless server's default agent pool.

```yaml
# proto.config.yaml — headless server example with 2-agent defaults

server:
  port: 3008
  autoMode: true

agents:
  defaults:
    count: 2
    model: claude-opus-4-6
    maxTokens: 8192

  pool:
    - name: builder
      role: engineer
      autoStart: true
      description: 'Implements features and fixes bugs'

    - name: reviewer
      role: reviewer
      autoStart: true
      description: 'Reviews PRs and enforces code quality'
```

**Environment variables for headless mode:**

| Variable                 | Description                       | Default        |
| ------------------------ | --------------------------------- | -------------- |
| `PORT`                   | Server listen port                | `3008`         |
| `NODE_ENV`               | Node environment                  | `development`  |
| `AUTO_MODE`              | Enable autonomous agent operation | `false`        |
| `DATA_DIR`               | Path to persistent data directory | `./data`       |
| `AUTOMAKER_API_KEY`      | API key for client authentication | auto-generated |
| `ALLOWED_ROOT_DIRECTORY` | Restrict file access to this path | unrestricted   |
