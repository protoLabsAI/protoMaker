# Dev Containers

protoLabs.studio ships a [Dev Container](https://containers.dev/) configuration for consistent, reproducible development environments. This works with VS Code, Cursor, JetBrains, and GitHub Codespaces.

## Quick Start

### VS Code / Cursor

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open the repo folder
3. Command Palette → **Dev Containers: Reopen in Container**
4. Wait for the container to build (~2-3 minutes first time)
5. Run `npm run dev:web` to start developing

### GitHub Codespaces

1. Go to the repo on GitHub
2. Click **Code → Codespaces → Create codespace on main**
3. Wait for setup to complete
4. Run `npm run dev:web` — Codespaces auto-forwards ports

### JetBrains (Gateway)

1. Open JetBrains Gateway
2. Connect to the Dev Container via Docker or Codespaces
3. The `.devcontainer/devcontainer.json` is detected automatically

## What's Included

The Dev Container config (`.devcontainer/devcontainer.json`) provides:

| Component              | Details                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| **Base image**         | `mcr.microsoft.com/devcontainers/typescript-node:22` (Node.js 22 + npm) |
| **GitHub CLI**         | Pre-installed via Dev Container feature                                 |
| **Ports**              | 3007 (UI/Vite) and 3008 (API server) forwarded automatically            |
| **Post-create**        | `npm install && npm run build:packages` runs on first launch            |
| **VS Code extensions** | ESLint, Prettier, Tailwind CSS IntelliSense, Playwright                 |
| **Environment**        | `ANTHROPIC_API_KEY` passed from host, `AUTOMAKER_AUTO_LOGIN=true`       |

## Environment Variables

The container passes `ANTHROPIC_API_KEY` from your host environment. Set it before opening the container:

```bash
# macOS/Linux — add to ~/.bashrc, ~/.zshrc, or ~/.profile
export ANTHROPIC_API_KEY=sk-ant-...

# Or for GitHub Codespaces:
# Settings → Codespaces → Secrets → New secret
# Name: ANTHROPIC_API_KEY
# Value: sk-ant-...
# Repository: proto-labs-ai/protolabs-studio
```

Other optional variables can be added to `remoteEnv` in `devcontainer.json`:

```jsonc
"remoteEnv": {
  "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}",
  "LINEAR_API_KEY": "${localEnv:LINEAR_API_KEY}",
  "DISCORD_TOKEN": "${localEnv:DISCORD_TOKEN}"
}
```

## Electron Note

Dev Containers run headless Linux — the Electron desktop app won't work inside the container. Use `npm run dev:web` for browser-based development. The Electron build pipeline (`npm run build:electron`) still works for producing distributable packages.

## Customizing

To add tools or change the base image, edit `.devcontainer/devcontainer.json`. Common additions:

```jsonc
{
  "features": {
    // Add Docker-in-Docker for testing container builds
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    // Add Python (for scripts/tooling)
    "ghcr.io/devcontainers/features/python:1": { "version": "3.12" },
  },
}
```

After changing the config, rebuild: **Command Palette → Dev Containers: Rebuild Container**.

## Troubleshooting

**Container build fails on `npm install`**: Check that you have enough disk space. The full `node_modules` is ~1.5GB.

**`ANTHROPIC_API_KEY` not available**: Verify the variable is set in your host shell (`echo $ANTHROPIC_API_KEY`). For Codespaces, check that the secret is configured for the correct repository.

**Port 3007/3008 not forwarding**: Check the Ports tab in VS Code. If another process is using those ports on the host, change the local port mapping.

**`build:packages` fails**: This occasionally happens if the container runs out of memory. Increase Docker's memory limit (Docker Desktop → Settings → Resources → Memory → 8GB+).
