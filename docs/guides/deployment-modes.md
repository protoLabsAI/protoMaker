# Deployment Modes

protoLabs Studio supports two deployment modes depending on your use case.

---

## Mode 1: Web Application (Development)

The default mode. Runs the UI and server locally with hot reload via Vite.

**Start:**

```bash
npm run dev:full    # Starts UI (:3007) AND server (:3008) together
```

**Characteristics:**

- UI served at `http://localhost:3007` with Vite HMR.
- Server at `http://localhost:3008` with file watching.
- PWA support — installable from the browser.
- Suitable for individual developers and local development.

---

## Mode 2: Headless Server (No UI)

Run the Automaker backend server in production mode with auto-mode enabled and no browser UI. Ideal for CI runners, servers, or agent-only workloads.

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
- No browser window, no UI dependencies.
- Exposes the same HTTP/WebSocket API as the web application.
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
