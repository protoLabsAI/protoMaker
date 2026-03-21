# Agent Sandbox: Threat Model and Security Layers

This page explains why each security layer in the agent execution sandbox exists, what threats each layer addresses, and the known limitations you should understand before operating protoLabs Studio in a sensitive environment.

## Who this is for

Contributors adding new execution paths, operators hardening production deployments, and security reviewers auditing the system.

## Threat Model

protoLabs Studio agents execute LLM-generated code and shell commands. The threat surface is:

**What agents can do:**

- Spawn subprocesses (git, npm, compilers, linters)
- Read and write files within the project worktree
- Make outbound HTTP/HTTPS requests
- Run init scripts provided by the project (`.automaker/worktree-init.sh`)

**What we protect against:**

- Credential theft: agent reads `process.env` and exfiltrates API keys
- Host escape: agent exploits container privilege to reach the host filesystem or network
- Lateral movement: agent reaches internal services (databases, metadata APIs) not reachable from outside the container
- Persistent compromise: agent leaves artifacts that survive container restart
- Resource exhaustion: runaway agent process causes OOM or fork bomb

**What we do not protect against (known limitations):**

- A fully adversarial LLM response that understands its container environment in detail
- Zero-day kernel exploits that bypass seccomp and capability restrictions
- Malicious project init scripts — `worktree-init.sh` is operator-controlled and runs with the same privileges as the server process

## Security Layers

### 1. Non-Root Container User

The server and all agent processes run as UID 1001 (`automaker`). The entrypoint uses `gosu` to drop from root (required for startup) to this user before the Node.js process starts.

**Why it matters:** Most container escapes require root inside the container to be useful. Running as a non-root user raises the bar for any exploit to produce meaningful host access.

**Limitation:** Root inside the container is still potentially exploitable if combined with a kernel vulnerability and a missing capability. The non-root user is a necessary but not sufficient control.

### 2. Capability Drop

The production compose drops all Linux capabilities (`cap_drop: ALL`) and adds back only:

| Capability          | Why it is needed                                                           |
| ------------------- | -------------------------------------------------------------------------- |
| `CHOWN`             | Entrypoint sets file ownership on named volumes at startup                 |
| `SETUID` / `SETGID` | `gosu` drops from root to the `automaker` user                             |
| `DAC_OVERRIDE`      | Writing to files in host-mounted volumes that may have different ownership |

All other capabilities (network configuration, raw sockets, `ptrace`, `SYS_ADMIN`, etc.) are unavailable to the process and any subprocess it spawns.

**Why it matters:** Many privilege escalation techniques require capabilities like `SYS_PTRACE`, `NET_ADMIN`, or `SYS_MODULE`. Dropping them removes entire classes of attack.

### 3. No New Privileges

```yaml
security_opt:
  - no-new-privileges:true
```

This kernel flag prevents any subprocess from gaining privileges through SUID/SGID binaries or filesystem capabilities. Even if an agent manages to execute a SUID binary (e.g., `sudo`, `newgrp`), the kernel refuses the elevation.

**Why it matters:** Without this flag, an agent could potentially call `su` or a SUID binary to regain root even after the server dropped to non-root.

### 4. Path Restrictions via `secureFs`

The `ALLOWED_ROOT_DIRECTORY` environment variable restricts all file I/O through the `secureFs` adapter in `@protolabsai/platform`. Every read, write, mkdir, and unlink goes through `validatePath()`, which rejects any path that escapes the allowed root via symlinks, `..` traversal, or absolute paths outside the boundary.

This enforcement happens at the actual I/O call site (`libs/platform/src/secure-fs.ts`), not just at the API layer. This means internal services that bypass the API still get path enforcement.

**Why it matters:** Defense-in-depth. Even if an attacker bypasses API-layer validation, the underlying file operations fail at the point of execution.

**Limitation:** Subprocesses spawned by agents (e.g., shell scripts invoked by init scripts) do not go through `secureFs`. They are only contained by the container's volume mounts and the non-root user's filesystem permissions.

### 5. Environment Sanitization (`safeEnv`)

When `InitScriptService` spawns a worktree init script, it builds an explicit environment rather than passing `process.env` to the child process. See `apps/server/src/services/init-script-service.ts`.

The allowlist includes only:

- Automaker context variables (`AUTOMAKER_PROJECT_PATH`, `AUTOMAKER_WORKTREE_PATH`, `AUTOMAKER_BRANCH`)
- System path and locale (`PATH`, `HOME`, `USER`, `LANG`, etc.)
- Git and color output settings (`GIT_TERMINAL_PROMPT`, `FORCE_COLOR`)

**Excluded by design:** `ANTHROPIC_API_KEY`, `AUTOMAKER_API_KEY`, `GH_TOKEN`, `DISCORD_TOKEN`, `LANGFUSE_SECRET_KEY`, and all other credentials present in the server process environment.

**Rationale:** The server process must have these credentials to operate. Init scripts only need to set up the worktree (install dependencies, configure git hooks). Passing credentials to init scripts would create an unnecessary exfiltration path.

**Known limitation — Bash regex bypass:** Bash's `=~` (regex match) operator evaluates the right-hand side as an unquoted regex. An init script that constructs paths or commands by pattern-matching against environment variable values could potentially be manipulated if an attacker controls variable content. Since `AUTOMAKER_BRANCH` is agent-derived, treat branch names as untrusted input in init scripts. Validate branch names before using them in shell expansions.

### 6. tmpfs for /tmp

```yaml
tmpfs:
  - /tmp
```

The `/tmp` directory is backed by RAM, not the container filesystem. Any files written there are lost when the container stops or restarts.

**Why it matters:** Agents and their subprocesses may write temporary files or payloads to `/tmp`. Mounting as tmpfs ensures these do not persist across restarts and are not accessible via the container image layer or storage driver.

### 7. Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 8G
      pids: 512
```

The `pids` limit prevents fork bombs. CPU and memory limits bound the blast radius of a runaway agent.

**Why it matters:** An agent that enters an infinite loop or spawns unbounded subprocesses cannot consume all host resources. The container is OOM-killed or throttled before it affects other workloads.

### 8. Network Isolation

The Docker network provides default isolation: containers can only reach each other by name on the internal network, and the host's non-Docker services are not reachable unless explicitly mapped.

For egress restriction, apply host-level iptables rules to block access to cloud metadata services (169.254.169.254) and internal network ranges. See the [SSRF Prevention section in the security guide](../../self-hosting/security#ssrf-prevention).

## Audit Trail

The authority system records every agent action proposal and decision. This provides forensic visibility after the fact, even when all other controls are in place.

- **Format:** JSONL, one JSON object per line
- **Location:** `{projectPath}/.automaker/authority/audit.jsonl`
- **API:** `POST /api/authority/audit` — query entries with filters for event type, agent ID, and time range

See the [Audit Trail section in the security guide](../../self-hosting/security#audit-trail) for the full field reference and rotation instructions.

## Security Controls Summary

| Control                  | Where it lives                        | Enforced for                    |
| ------------------------ | ------------------------------------- | ------------------------------- |
| Non-root user            | Dockerfile + entrypoint               | All server + agent processes    |
| Capability drop          | `docker-compose.prod.yml`             | Container and all its children  |
| No new privileges        | `docker-compose.prod.yml`             | SUID/SGID escalation attempts   |
| Path restrictions        | `secureFs` in `@protolabsai/platform` | All server-initiated file I/O   |
| Environment sanitization | `InitScriptService`                   | Init scripts only               |
| tmpfs /tmp               | `docker-compose.prod.yml`             | Temporary file persistence      |
| Resource limits          | `docker-compose.prod.yml`             | CPU, memory, process count      |
| Network isolation        | Docker networking                     | Inter-container and host access |
| Audit trail              | `AuditService`                        | Authority system actions        |

## References

- `apps/server/src/services/init-script-service.ts` — `safeEnv` construction
- `libs/platform/src/secure-fs.ts` — path validation and file I/O adapter
- `docker-compose.prod.yml` — capability and resource configuration
- `apps/server/src/services/audit-service.ts` — audit trail implementation
- `apps/server/src/routes/authority/index.ts` — audit query API
- [Security guide](../../self-hosting/security) — operator-facing configuration reference
