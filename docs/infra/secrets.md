# Secret Management

This guide covers centralized secret management for the Automaker team, including deployment of Infisical on the Tailscale mesh and integration with MCP servers, Docker, and CLI tools.

## Problem

Secrets are currently scattered across multiple locations:

- Root `.env` file (plaintext, gitignored)
- `docker-compose.override.yml` (hardcoded values)
- `plugin.json` (hardcoded API keys)
- MCP server code (hardcoded fallback: `automaker-dev-key-2026`)

This causes friction when onboarding team members and creates security risks from duplicated credentials.

## Solution: Infisical

[Infisical](https://infisical.com) is an open-source secret management platform that provides:

- Web UI for browsing and editing secrets
- CLI (`infisical run`) for injecting secrets into any command
- Docker-native integration
- Audit logging and secret versioning
- Environment-based organization (dev/staging/prod)

### Why Infisical

| Criteria             | Infisical       | Vault            | SOPS          | 1Password Connect |
| -------------------- | --------------- | ---------------- | ------------- | ----------------- |
| Setup effort         | Moderate        | High             | Low           | Low-Moderate      |
| Web UI               | Excellent       | Yes              | No            | Via app           |
| Docker injection     | Native          | Good             | Manual        | Good              |
| MCP config injection | `infisical run` | Script needed    | Script needed | `op run`          |
| Maintenance          | Low             | High (unsealing) | Very low      | Low               |
| Cost                 | Free (OSS)      | Free (OSS)       | Free          | ~$8/user/mo       |
| Self-hosted          | Yes             | Yes              | N/A           | Partial           |

## Deployment on Proxmox

### Prerequisites

- Proxmox server on the Tailscale mesh
- Docker and Docker Compose installed
- At least 1GB RAM available (512MB app + Postgres + Redis)

### Docker Compose

Create `~/infisical/docker-compose.yml` on the Proxmox server:

```yaml
services:
  infisical:
    image: infisical/infisical:latest
    container_name: infisical
    restart: unless-stopped
    ports:
      - '8080:8080'
    environment:
      - ENCRYPTION_KEY=<generate-with-openssl-rand-hex-16>
      - AUTH_SECRET=<generate-with-openssl-rand-base64-32>
      - DB_CONNECTION_URI=postgres://infisical:changeme@postgres:5432/infisical
      - REDIS_URL=redis://redis:6379
      - SITE_URL=http://infisical.tailnet:8080
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    container_name: infisical-postgres
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=infisical
      - POSTGRES_PASSWORD=changeme
      - POSTGRES_DB=infisical
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U infisical']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: infisical-redis
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

### Initial Setup

```bash
# Generate secrets
export ENCRYPTION_KEY=$(openssl rand -hex 16)
export AUTH_SECRET=$(openssl rand -base64 32)

# Update docker-compose.yml with generated values, then:
cd ~/infisical
docker compose up -d

# Access web UI at http://<proxmox-tailscale-ip>:8080
# Create admin account, then create a project called "automaker"
```

### Tailscale Access

Once deployed, all machines on the Tailnet can access Infisical at:

```
http://<proxmox-hostname>.tailnet-name.ts.net:8080
```

If using MagicDNS, you can access it simply as `http://proxmox:8080` (adjust hostname to match your Tailscale machine name).

No Cloudflare tunnel needed for internal access. Only expose via tunnel if external team members need access outside the VPN.

## Organizing Secrets

Create these secret paths in Infisical under the "automaker" project:

### Development Environment

```
ANTHROPIC_API_KEY=sk-ant-xxx
AUTOMAKER_API_KEY=<generated-secure-key>
GH_TOKEN=gho_xxx
DISCORD_BOT_TOKEN=xxx
LINEAR_API_TOKEN=lin_api_xxx
CLAUDE_OAUTH_CREDENTIALS={"accessToken":"..."}
CURSOR_AUTH_TOKEN=xxx
```

### Production Environment

Same keys, different values for production deployments.

## Integration Patterns

### MCP Server Configs

Wrap MCP server commands with `infisical run` to inject secrets at startup.

**Claude Code user-level MCP config** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "automaker": {
      "command": "infisical",
      "args": [
        "run",
        "--projectId",
        "<project-id>",
        "--env",
        "dev",
        "--",
        "node",
        "/home/josh/dev/automaker/packages/mcp-server/dist/index.js"
      ]
    },
    "discord": {
      "command": "infisical",
      "args": [
        "run",
        "--projectId",
        "<project-id>",
        "--env",
        "dev",
        "--",
        "npx",
        "-y",
        "mcp-discord"
      ]
    },
    "linear": {
      "command": "infisical",
      "args": [
        "run",
        "--projectId",
        "<project-id>",
        "--env",
        "dev",
        "--",
        "npx",
        "-y",
        "@tacticlaunch/mcp-linear"
      ]
    }
  }
}
```

The `infisical run` command fetches all secrets from the project and injects them as environment variables before launching the wrapped command. No `.env` files needed.

### Docker Compose

```bash
# Option 1: Wrap docker compose with infisical
infisical run --env=production -- docker compose up -d

# Option 2: Export to .env file for compose
infisical export --env=production --format=dotenv > .env
docker compose --env-file .env up -d
```

### Shell Profile

Add to `~/.bashrc` or `~/.zshrc` for ambient secret access:

```bash
# Load Automaker secrets into shell
alias automaker-env='eval $(infisical export --env=dev --format=shell --projectId=<id>)'
```

### CI/CD (GitHub Actions)

Use Infisical's GitHub Actions integration or export secrets to GitHub Actions secrets:

```yaml
- name: Fetch secrets
  uses: infisical/secrets-action@v1
  with:
    url: http://infisical.tailnet:8080
    token: ${{ secrets.INFISICAL_TOKEN }}
    project-id: <project-id>
    env: production
```

## Team Onboarding

### New Team Member Setup

1. **Join Tailscale** - Accept invite to the team Tailnet
2. **Access Infisical** - Open `http://proxmox:8080` in browser, create account
3. **Install CLI**:

   ```bash
   # npm
   npm install -g @infisical/cli

   # or brew
   brew install infisical/cli/infisical

   # or apt
   curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
   sudo apt install infisical
   ```

4. **Login**:
   ```bash
   infisical login --domain=http://proxmox:8080
   ```
5. **Verify**:
   ```bash
   infisical run --env=dev -- env | grep ANTHROPIC
   ```
6. **Configure MCP servers** - Copy the MCP config pattern from above into `~/.claude.json`

### Compared to Current Onboarding

| Step              | Before (manual)                | After (Infisical)                    |
| ----------------- | ------------------------------ | ------------------------------------ |
| Get Discord token | Ask someone, paste into .env   | Already in Infisical                 |
| Get Linear key    | Generate personal key, paste   | Already in Infisical                 |
| Get Anthropic key | Ask admin, paste into .env     | Already in Infisical                 |
| Configure MCP     | Edit plugin.json, set env vars | Copy MCP config template             |
| Docker setup      | Copy .env.example, fill in     | `infisical run -- docker compose up` |

## Migration Path

### Phase 1: Deploy Infisical (Day 1)

1. Deploy on Proxmox using the compose file above
2. Import current secrets from `.env` into Infisical web UI
3. Verify access from other Tailscale nodes

### Phase 2: Update MCP Configs (Day 2)

1. Update MCP server configs to use `infisical run` wrapper
2. Test all MCP tools still work (automaker, discord, linear)
3. Remove hardcoded keys from `plugin.json`

### Phase 3: Update Docker (Day 3)

1. Switch docker-compose.override.yml to use `infisical export`
2. Remove plaintext `.env` file
3. Update CI/CD to use Infisical GitHub Action

### Phase 4: Cleanup (Day 4)

1. Remove hardcoded fallback key from `packages/mcp-server/src/index.ts`
2. Update `.env.example` files with Infisical instructions
3. Rotate all secrets that were previously in plaintext

## Backup

Infisical data lives in the Postgres volume. Back up with:

```bash
# On Proxmox server
docker exec infisical-postgres pg_dump -U infisical infisical > ~/backups/infisical-$(date +%Y%m%d).sql

# Restore
cat ~/backups/infisical-20260205.sql | docker exec -i infisical-postgres psql -U infisical infisical
```

## Alternatives

If Infisical doesn't work out, the next-best options are:

### 1Password Connect

If the team already uses 1Password Teams/Business (~$8/user/month):

```bash
# Template file (.env.tpl)
ANTHROPIC_API_KEY=op://Automaker/Anthropic/api-key
DISCORD_TOKEN=op://Automaker/Discord Bot/token

# Inject
op run --env-file=.env.tpl -- node mcp-server/dist/index.js
```

### SOPS + age (Zero Infrastructure)

For teams that prefer no server dependency:

```bash
# Encrypt
sops encrypt --in-place secrets.enc.env

# Decrypt and run
sops exec-env secrets.enc.env 'node mcp-server/dist/index.js'
```

Trade-off: No web UI, no audit log, manual key distribution.

## Security Notes

- Infisical encrypts secrets at rest using AES-256-GCM
- All traffic between Tailscale nodes is encrypted (WireGuard)
- Access is authenticated per-user with audit logging
- Secret versioning allows rollback if compromised
- The ENCRYPTION_KEY and AUTH_SECRET for Infisical itself should be backed up securely (e.g., in a physical safe or password manager)
