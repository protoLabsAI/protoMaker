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

## Agent Sandbox Hardening

protoLabs Studio runs AI agents that execute shell commands in git worktrees. This section documents the defense-in-depth layers that contain agent execution and limit blast radius if an agent misbehaves.

### Defense-in-Depth Layers

| Layer                    | Mechanism                                       | What it protects against                                |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| Non-root user            | Container runs as UID 1001                      | Host privilege escalation via container breakout        |
| Capability drop          | `cap_drop: ALL` + minimal adds                  | Kernel exploits requiring privileged capabilities       |
| No new privileges        | `security_opt: no-new-privileges:true`          | SUID/SGID binaries elevating permissions mid-run        |
| Path restrictions        | `ALLOWED_ROOT_DIRECTORY` enforced by `secureFs` | Agents reading/writing outside designated project root  |
| Environment sanitization | `safeEnv` whitelist in `InitScriptService`      | Credential leakage via environment inheritance          |
| tmpfs for /tmp           | `tmpfs: /tmp`                                   | Persistent attack artifacts surviving container restart |
| Network isolation        | No host network, explicit port mapping          | Lateral movement to other services on the host          |
| Resource limits          | CPU, memory, PID limits                         | Resource exhaustion (denial of service)                 |
| Audit trail              | JSONL log at `.automaker/authority/audit.jsonl` | Undetected authority system abuse                       |

### Capability Management

The production compose drops all Linux capabilities and adds back only the minimum required for the server to run:

```yaml
services:
  server:
    cap_drop:
      - ALL
    cap_add:
      - CHOWN # Set file ownership during init
      - SETUID # Drop to non-root user via gosu
      - SETGID # Drop to non-root group via gosu
      - DAC_OVERRIDE # Write to files owned by other users in mounted volumes
    security_opt:
      - no-new-privileges:true
```

Agents executed inside the container inherit these restrictions. They cannot call `mount`, `ptrace`, modify network interfaces, or perform any other operation requiring dropped capabilities.

### Read-Only Root Filesystem

For maximum hardening, combine `read_only: true` with explicit writable mounts:

```yaml
services:
  server:
    read_only: true
    tmpfs:
      - /tmp # Temporary files
      - /run # PID files and sockets
    volumes:
      - automaker-data:/data # Persistent app data
      - automaker-claude-config:/home/automaker/.claude # Claude CLI state
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETUID
      - SETGID
```

Note: The default production compose sets `read_only: false` because npm and some CLI tools write to locations that are difficult to enumerate in advance. Enable `read_only: true` after testing that all required paths are covered by tmpfs or named volumes.

### Environment Sanitization

When `InitScriptService` spawns worktree init scripts, it builds an explicit environment allowlist rather than inheriting `process.env`. This prevents agent scripts from accessing credentials present in the server process.

The allowed variables are:

| Variable                         | Purpose                           |
| -------------------------------- | --------------------------------- |
| `AUTOMAKER_PROJECT_PATH`         | Absolute path to the project root |
| `AUTOMAKER_WORKTREE_PATH`        | Absolute path to the worktree     |
| `AUTOMAKER_BRANCH`               | Branch name for this worktree     |
| `PATH`                           | Command search path               |
| `HOME`                           | Home directory                    |
| `USER`                           | Username                          |
| `TMPDIR`                         | Temporary directory               |
| `SHELL`                          | Default shell                     |
| `LANG` / `LC_ALL`                | Locale settings                   |
| `FORCE_COLOR` / `CLICOLOR_FORCE` | Color output control              |
| `GIT_TERMINAL_PROMPT`            | Disable interactive git prompts   |

Credentials such as `ANTHROPIC_API_KEY`, `GH_TOKEN`, and `AUTOMAKER_API_KEY` are deliberately excluded.

### SSRF Prevention

Agents executing in the container can make network requests. To limit server-side request forgery (SSRF) to internal services, apply egress firewall rules at the host level:

```bash
# Block access to cloud metadata services from within containers
sudo iptables -I DOCKER-USER -d 169.254.169.254 -j DROP
sudo iptables -I DOCKER-USER -d 192.168.0.0/16 -j DROP

# Allow only specific outbound destinations (optional, strict mode)
# sudo iptables -I DOCKER-USER -j DROP  # deny all
# sudo iptables -I DOCKER-USER -d 0.0.0.0/0 -p tcp --dport 443 -j ACCEPT  # allow HTTPS
```

These rules apply to all containers on the host. Adjust CIDR ranges to match your network topology.

For environments that use Docker's internal DNS (`127.0.0.11`), preserve access to that address to avoid breaking container name resolution.

### seccomp Profile

Docker applies a default seccomp profile that blocks ~300 system calls. For tighter restrictions, provide a custom profile:

```yaml
services:
  server:
    security_opt:
      - no-new-privileges:true
      - seccomp:/path/to/seccomp-profile.json
```

Start from Docker's default profile and remove syscalls your workload does not need. Common removals for Node.js servers:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "accept",
        "bind",
        "clone",
        "connect",
        "execve",
        "exit_group",
        "futex",
        "getpid",
        "listen",
        "mmap",
        "mprotect",
        "open",
        "openat",
        "read",
        "recvfrom",
        "sendto",
        "socket",
        "write"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

To customize for your environment:

1. Run the server with audit logging enabled: `--security-opt seccomp:unconfined` and capture syscall traces with `strace` or `auditd`.
2. Add required syscalls to the allowlist.
3. Switch to your custom profile and verify the server starts cleanly.
4. Test the full agent execution flow (worktree creation, init script, PR creation) before deploying to production.

The default Docker seccomp profile (`/etc/docker/seccomp.json` on the host) is a safe starting point that permits all syscalls needed by standard Node.js workloads.

## Audit Trail

The authority system logs every agent proposal, approval, rejection, and escalation to an append-only JSONL file.

### Log Location

```
{projectPath}/.automaker/authority/audit.jsonl
```

Each line is a JSON object:

```json
{
  "timestamp": "2026-03-21T14:32:10.123Z",
  "projectPath": "/projects/my-app",
  "eventType": "approved",
  "agentId": "agent-abc123",
  "role": "feature-engineer",
  "action": "write_file",
  "target": "src/auth/login.ts",
  "risk": "low",
  "verdict": "approved",
  "requestId": "req-xyz"
}
```

### Event Types

| `eventType`          | When it appears                                  |
| -------------------- | ------------------------------------------------ |
| `proposal_submitted` | Agent submitted an action for evaluation         |
| `approved`           | Action approved (auto or manual)                 |
| `rejected`           | Action denied by policy                          |
| `awaiting_approval`  | Action escalated for human review                |
| `agent_registered`   | New agent joined the authority system            |
| `trust_updated`      | Agent trust level changed                        |
| `idea_injected`      | CTO injected a feature idea into the PM pipeline |
| `decision_logged`    | Structured architectural decision recorded       |

### Query the Audit Trail

```bash
# Query recent entries for a project
curl -X POST http://localhost:3008/api/authority/audit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/projects/my-app",
    "limit": 50,
    "since": "2026-03-01T00:00:00Z"
  }'

# Filter by event type
curl -X POST http://localhost:3008/api/authority/audit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/projects/my-app", "eventType": "rejected"}'

# Filter by agent
curl -X POST http://localhost:3008/api/authority/audit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/projects/my-app", "agentId": "agent-abc123"}'
```

### Log Rotation

The JSONL file grows indefinitely. Rotate it with `logrotate` or a cron job:

```bash
# /etc/logrotate.d/automaker-audit
/projects/*/\.automaker/authority/audit.jsonl {
  daily
  rotate 30
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}
```

`copytruncate` is required because the server appends to the file via open file descriptors. Rename-based rotation would leave the server writing to the old inode.

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
