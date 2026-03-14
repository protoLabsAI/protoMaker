# Secret Management

This guide covers how to set up centralized secret management for protoLabs deployments, including integration with MCP servers, Docker, and CLI tools.

## Problem

Secrets are often scattered across multiple locations:

- Root `.env` file (plaintext, gitignored)
- `docker-compose.override.yml` (hardcoded values)
- `plugin.json` (hardcoded API keys)
- MCP server config (env var passthrough from shell)

This causes friction when onboarding team members and creates security risks from duplicated credentials.

## Solution: Infisical

> **Status: Planned.** Infisical is not yet deployed. protoLabs currently uses `.env` files (gitignored) for secret management. This section describes the target architecture for when centralized secret management is adopted.

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

## Deployment

### Prerequisites

- A server with Docker and Docker Compose installed
- At least 1GB RAM available (512MB app + Postgres + Redis)

### Docker Compose

Create `~/infisical/docker-compose.yml`:

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
      - SITE_URL=http://localhost:8080
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

# Access web UI at http://localhost:8080
# Create admin account, then create a project called "automaker"
```

## Organizing Secrets

Create these secret paths in Infisical under your project:

### Development Environment

```
ANTHROPIC_API_KEY=sk-ant-xxx
AUTOMAKER_API_KEY=<generated-secure-key>
GH_TOKEN=gho_xxx
DISCORD_BOT_TOKEN=xxx
CLAUDE_OAUTH_CREDENTIALS={"accessToken":"..."}
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
        "/path/to/protomaker/packages/mcp-server/dist/index.js"
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
# Load protoLabs secrets into shell
alias automaker-env='eval $(infisical export --env=dev --format=shell --projectId=<id>)'
```

### CI/CD (GitHub Actions)

Use Infisical's GitHub Actions integration or export secrets to GitHub Actions secrets:

```yaml
- name: Fetch secrets
  uses: infisical/secrets-action@v1
  with:
    url: http://<infisical-host>:8080
    token: ${{ secrets.INFISICAL_TOKEN }}
    project-id: <project-id>
    env: production
```

## Migration Path

### Phase 1: Deploy Infisical

1. Deploy using the compose file above
2. Import current secrets from `.env` into Infisical web UI
3. Verify access

### Phase 2: Update MCP Configs

1. Update MCP server configs to use `infisical run` wrapper
2. Test all MCP tools still work (automaker, discord)
3. Remove hardcoded keys from `plugin.json`

### Phase 3: Update Docker

1. Switch docker-compose.override.yml to use `infisical export`
2. Remove plaintext `.env` file
3. Update CI/CD to use Infisical GitHub Action

### Phase 4: Cleanup

1. Remove hardcoded fallback keys from MCP server code
2. Update `.env.example` files with Infisical instructions
3. Rotate all secrets that were previously in plaintext

## Backup

Infisical data lives in the Postgres volume. Back up with:

```bash
docker exec infisical-postgres pg_dump -U infisical infisical > ~/backups/infisical-$(date +%Y%m%d).sql

# Restore
cat ~/backups/infisical-20260205.sql | docker exec -i infisical-postgres psql -U infisical infisical
```

## Alternatives

If Infisical doesn't work out, the next-best options are:

### 1Password Connect

If your team uses 1Password Teams/Business (~$8/user/month):

```bash
# Template file (.env.tpl)
ANTHROPIC_API_KEY=op://protoLabs/Anthropic/api-key
DISCORD_TOKEN=op://protoLabs/Discord Bot/token

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
- Access is authenticated per-user with audit logging
- Secret versioning allows rollback if compromised
- The ENCRYPTION_KEY and AUTH_SECRET for Infisical itself should be backed up securely (e.g., in a physical safe or password manager)
