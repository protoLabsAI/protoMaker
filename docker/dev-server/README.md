# Automaker Dev Server — Dockerized

Always-on, production-mode container running the **dev branch** on `localhost:3008`.

- Starts automatically on machine boot (Docker Desktop auto-start + `restart: unless-stopped`)
- Auto-rebuilds within 5 minutes of a new commit landing on `dev` (via CI + Watchtower)
- State (features, data, credentials) persists across rebuilds via mounted volumes

## Architecture

```
Push to dev branch
      │
      ▼
GitHub Actions (build-dev-image.yml)
  • Builds docker/dev-server/Dockerfile
  • Pushes ghcr.io/protolabsai/automaker-dev-server:latest to GHCR
      │
      ▼ (within 5 minutes)
Watchtower (running locally)
  • Polls GHCR every 5 minutes
  • Pulls new image when SHA changes
  • Gracefully restarts automaker-dev-server container
      │
      ▼
automaker-dev-server (localhost:3008)
  • NODE_ENV=production
  • node apps/server/dist/index.js
  • Mounts ./data and ./.automaker from repo
```

## One-Time Setup

### 1. Enable Docker Desktop auto-start

Open Docker Desktop → Settings → General → ✅ **Start Docker Desktop when you log in**

This ensures the Docker daemon is running when your machine boots, which in turn allows `restart: unless-stopped` containers to auto-start.

### 2. Authenticate to GHCR

CI pushes images to GHCR. Watchtower needs credentials to pull them.

```bash
# Create a GitHub PAT with read:packages scope at:
# https://github.com/settings/tokens/new?scopes=read:packages
#
# Then log in:
echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

This writes credentials to `~/.docker/config.json`, which the compose mounts into Watchtower.

### 3. Make the GHCR package visible to Watchtower

After the first CI push, go to:
`https://github.com/orgs/protoLabsAI/packages/container/automaker-dev-server`

→ Package settings → Change visibility to **Internal** (or Private if needed)

### 4. Start the containers

From the repo root:

```bash
docker compose -f docker/dev-server/docker-compose.yml up -d
```

Check status:

```bash
docker compose -f docker/dev-server/docker-compose.yml ps
docker logs automaker-dev-server --tail 50
```

## Daily Usage

| Task                  | Command                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Start                 | `docker compose -f docker/dev-server/docker-compose.yml up -d`                                                                 |
| Stop                  | `docker compose -f docker/dev-server/docker-compose.yml down`                                                                  |
| View logs             | `docker logs automaker-dev-server -f`                                                                                          |
| Force rebuild now     | `docker compose -f docker/dev-server/docker-compose.yml pull && docker compose -f docker/dev-server/docker-compose.yml up -d`  |
| Build locally (no CI) | `docker compose -f docker/dev-server/docker-compose.yml build && docker compose -f docker/dev-server/docker-compose.yml up -d` |
| Health check          | `curl http://localhost:3008/api/health`                                                                                        |

## Environment Variables

The container inherits variables from the host shell or repo-root `.env`. At minimum you need:

| Variable                   | Required | Description                                          |
| -------------------------- | -------- | ---------------------------------------------------- |
| `ANTHROPIC_API_KEY`        | ✅       | Claude API key                                       |
| `AUTOMAKER_API_KEY`        | ✅       | Server API key                                       |
| `DISCORD_TOKEN`            | optional | Discord bot token                                    |
| `GH_TOKEN`                 | optional | GitHub token (for `gh` CLI in agents)                |
| `CLAUDE_OAUTH_CREDENTIALS` | optional | Claude CLI OAuth (if using OAuth instead of API key) |

The repo-root `.env` is **not** mounted directly (to avoid leaking dev secrets). Variables are passed explicitly via the `environment:` block in `docker-compose.yml`. Make sure your shell has them set, or add them to the repo-root `.env` and they'll be interpolated by Docker Compose automatically.

## Volumes

| Mount                                                     | Purpose                                  |
| --------------------------------------------------------- | ---------------------------------------- |
| `../../data` → `/data`                                    | Persistent app data (features, projects) |
| `../../.automaker` → `/app/.automaker`                    | Agent memory, skills, config             |
| `automaker-dev-claude-config` → `/home/automaker/.claude` | Claude CLI credentials                   |

## How Auto-Rebuild Works

1. A PR is merged into `dev`
2. GitHub Actions runs `.github/workflows/build-dev-image.yml`
3. The workflow builds the server image and pushes to GHCR with tag `latest` + the commit SHA
4. Watchtower polls GHCR every **5 minutes**
5. When it detects a new `latest` digest, it pulls the new image and restarts `automaker-dev-server`
6. The health check confirms the new container is ready

Build time is typically **5–10 minutes** (layer caching keeps it fast after the first build). Total time from merged PR to running container: **≤ 15 minutes**.

## Troubleshooting

**Container not starting after reboot:**

- Verify Docker Desktop is set to auto-start on login
- Run `docker ps -a` to check container state

**Watchtower not pulling new images:**

- Check `docker logs automaker-dev-watchtower` for auth errors
- Re-run `docker login ghcr.io` if credentials expired

**Server crashes on start:**

- Check `docker logs automaker-dev-server --tail 100`
- Verify all required env vars are set
- Try a local build to reproduce: `docker compose -f docker/dev-server/docker-compose.yml build`

**Port 3008 already in use:**

- Stop the native dev server: kill any `npm run dev:headless` process
- Or change the port mapping in `docker-compose.yml`: `- '3009:3008'`
