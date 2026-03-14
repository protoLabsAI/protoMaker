# Security

This guide covers container security, credential management, and security best practices.

## Container Security

### Non-Root User

The server container runs as a non-root user:

```dockerfile
ARG UID=1001
ARG GID=1001

RUN groupadd -o -g ${GID} automaker && \
    useradd -o -u ${UID} -g automaker -m -d /home/automaker -s /bin/bash automaker
```

The entrypoint script switches to this user:

```bash
exec gosu automaker "$@"
```

### No Privileged Mode

Containers run without elevated privileges:

```yaml
services:
  server:
    # No privileged: true
    # No cap_add
    # No security_opt overrides
```

### Read-Only Root Filesystem (Optional)

For enhanced security:

```yaml
services:
  server:
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - automaker-data:/data
```

### Resource Limits

Prevent resource exhaustion:

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Credential Management

### API Keys

**Never commit credentials to git.**

Use environment variables:

```yaml
services:
  server:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AUTOMAKER_API_KEY=${AUTOMAKER_API_KEY}
```

Store in `.env` file (gitignored):

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
AUTOMAKER_API_KEY=your-secure-key
```

### OAuth Credentials

For Claude CLI OAuth (macOS):

```bash
# Extract from Keychain (don't store in plain text)
export CLAUDE_OAUTH_CREDENTIALS=$(./scripts/get-claude-token.sh)
docker compose up -d
```

For Cursor CLI:

```bash
export CURSOR_AUTH_TOKEN=$(./scripts/get-cursor-token.sh)
```

### File Permissions

The entrypoint script sets secure permissions:

```bash
# Credentials files: owner read/write only
chmod 600 /home/automaker/.claude/.credentials.json
chmod 600 /home/automaker/.config/cursor/auth.json

# Config directories: owner access only
chmod 700 /home/automaker/.claude
chmod 700 /home/automaker/.cursor
```

### Centralized Secret Management

Use **Infisical** for centralized secret management across your infrastructure. See [secrets.md](./secrets.md) for the full deployment and integration guide.

For production Docker deployments, secrets can also be managed via:

Example with Docker Secrets:

```yaml
services:
  server:
    secrets:
      - anthropic_api_key
    environment:
      - ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key

secrets:
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
```

## Network Security

### Isolation

By default, containers are isolated:

- No host network access
- Only exposed ports accessible
- Inter-container communication via Docker network

### Restrict External Access

Bind to localhost only:

```yaml
services:
  server:
    ports:
      - '127.0.0.1:3008:3008'
```

### Firewall Rules

```bash
# Only allow from trusted networks
sudo ufw allow from 192.168.1.0/24 to any port 3007
sudo ufw deny 3007
```

## Filesystem Security

### Path Restrictions

Limit file operations to a specific directory:

```yaml
environment:
  - ALLOWED_ROOT_DIRECTORY=/home/user/projects
```

The server enforces this restriction for all file operations.

### Volume Security

**Isolated Mode** (most secure):

```yaml
volumes:
  - automaker-data:/data # Named volume only
```

**Mounted Mode** (less secure):

```yaml
volumes:
  - /home/user/projects:/home/user/projects:rw
```

Consider `:ro` for read-only mounts where possible.

### Sensitive Files

Files that should NEVER be mounted or committed:

- `.env` files with secrets
- `~/.claude/.credentials.json`
- `~/.config/cursor/auth.json`
- `~/.ssh/` keys
- `~/.gnupg/` keys

## Authentication

### API Key Authentication

The protoLabs API requires authentication:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:3008/api/health
```

If `AUTOMAKER_API_KEY` is not set, one is auto-generated and logged at startup.

### Login Flow

The UI requires authentication:

1. User enters API key
2. Key is validated against server
3. Session stored in browser localStorage

### CLI Tool Authentication

Each CLI tool has its own auth:

| Tool       | Auth Method | Storage                       |
| ---------- | ----------- | ----------------------------- |
| Claude CLI | OAuth       | `~/.claude/.credentials.json` |
| Cursor CLI | OAuth       | `~/.config/cursor/auth.json`  |
| GitHub CLI | OAuth/Token | `gh auth` / `GH_TOKEN`        |

## Security Scanning

### Image Scanning

```bash
# Scan for vulnerabilities
docker scan automaker-server

# Or use Trivy
trivy image automaker-server
```

### Dependency Audit

```bash
# npm audit
npm audit --audit-level=critical

# Run in CI
npm audit --audit-level=critical --production
```

### GitHub Security Features

Enable in repository settings:

- Dependabot alerts
- Dependabot security updates
- Code scanning (CodeQL)
- Secret scanning

## Security Checklist

### Development

- [ ] Never commit secrets to git
- [ ] Use `.env` files (gitignored)
- [ ] Run `npm audit` regularly
- [ ] Keep dependencies updated

### Deployment

- [ ] Use non-root container user
- [ ] Set `ALLOWED_ROOT_DIRECTORY`
- [ ] Restrict network access (firewall)
- [ ] Use HTTPS in production
- [ ] Set secure CORS origins
- [ ] Enable container health checks
- [ ] Set resource limits

### Credentials

- [ ] Use environment variables for secrets
- [ ] Secure file permissions (600 for files, 700 for dirs)
- [ ] Rotate API keys periodically
- [ ] Use short-lived OAuth tokens where possible
- [ ] Don't log secrets

### Monitoring

- [ ] Enable audit logging
- [ ] Monitor for unauthorized access
- [ ] Set up alerts for failures
- [ ] Review logs regularly

## Command Injection Audit

Security audit identified command injection vulnerabilities in worktree routes where user-controlled inputs are interpolated into shell commands.

### Affected Patterns

Routes using `execAsync` with template literals instead of `execGitCommand` with array arguments:

- **Merge handler** (`routes/worktree/routes/merge.ts`) — branch names and commit messages interpolated directly
- **Push handler** (`routes/worktree/routes/push.ts`) — remote names not validated before shell use

### Remediation

1. Replace `execAsync` template literals with `execGitCommand` array calls
2. Validate all inputs with allowlist patterns
3. Use `isValidBranchName()` before any git operations
4. Sanitize commit messages before shell use

### Security Testing

Security tests exist at:

- `apps/server/tests/security/command-injection.test.ts` — integration tests for injection prevention
- `libs/platform/tests/validation.test.ts` — unit tests for `validateSlugInput`

## Known Security Considerations

### Agent Execution

AI agents can execute commands in the project directory. Mitigations:

1. **Isolated mode**: Use Docker volumes only
2. **Path restrictions**: Set `ALLOWED_ROOT_DIRECTORY`
3. **Review agent output**: Check changes before merging

### Terminal Access

The terminal feature provides shell access within the container. Mitigations:

1. Run as non-root user
2. Container isolation limits blast radius
3. Mounted volumes are the only host exposure

### WebSocket Security

WebSocket connections require the same API key authentication as REST endpoints.

## Incident Response

### Suspected Compromise

1. Stop containers: `docker compose down`
2. Rotate all credentials:
   - `AUTOMAKER_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GH_TOKEN`
   - Re-authenticate Claude/Cursor CLI
3. Review logs: `docker compose logs`
4. Check for unauthorized changes in mounted projects
5. Rebuild containers: `docker compose build --no-cache`

### Credential Leak

If credentials are exposed:

1. Immediately rotate affected credentials
2. Check for unauthorized usage:
   - Anthropic Console for API key usage
   - GitHub for unauthorized commits/PRs
3. Enable/review audit logs
4. Update all affected systems
