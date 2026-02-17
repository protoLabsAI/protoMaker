# Troubleshooting

Common issues and their solutions.

## Quick Diagnostics

Run the DevOps health check:

```
/devops health
```

Or manually:

```bash
# Check container status
docker compose ps

# Check logs
docker compose logs --tail=50

# Check health endpoint
curl http://localhost:3008/api/health
```

## Container Issues

### Containers Won't Start

**Symptoms:** `docker compose up` fails or containers exit immediately.

**Check:**

```bash
# View exit codes
docker compose ps -a

# Check logs
docker compose logs server
docker compose logs ui
```

**Common causes:**

1. **Port already in use:**

   ```bash
   lsof -i :3007
   lsof -i :3008
   # Kill conflicting process or change ports
   ```

2. **Missing environment variables:**

   ```bash
   docker compose config  # Validate compose file
   ```

3. **Docker not running:**

   ```bash
   sudo systemctl status docker
   sudo systemctl start docker
   ```

4. **Disk full:**
   ```bash
   docker system df
   docker system prune  # Clean up
   ```

### Container Keeps Restarting

**Symptoms:** Container starts, crashes, restarts in a loop.

**Check:**

```bash
docker compose logs -f server
docker inspect automaker-server --format '{{.State.ExitCode}}'
```

**Common causes:**

1. **Application error:** Check logs for stack traces
2. **Missing dependencies:** Rebuild image
3. **Permission issues:** Check volume mounts

### Container is Unhealthy

**Symptoms:** `docker compose ps` shows "unhealthy" status.

**Check:**

```bash
docker inspect automaker-server --format '{{json .State.Health}}' | jq
```

**Common causes:**

1. **Server not responding:** Check application logs
2. **Health check timing:** Increase `start_period` in compose file
3. **Network issues:** Verify internal network

## Network Issues

### Can't Access UI

**Symptoms:** Browser shows connection refused at `localhost:3007`.

**Check:**

```bash
# Is UI container running?
docker compose ps ui

# Is nginx running inside?
docker exec automaker-ui nginx -t

# Is port mapped?
docker port automaker-ui
```

**Solutions:**

1. Ensure UI container is running: `docker compose up -d ui`
2. Check port mapping in compose file
3. Try `http://127.0.0.1:3007` instead of `localhost`

### API Requests Failing

**Symptoms:** UI loads but API calls fail.

**Check:**

```bash
# Direct API test
curl http://localhost:3008/api/health

# From UI container
docker exec automaker-ui curl http://server:3008/api/health
```

**Solutions:**

1. Verify server is running
2. Check nginx proxy configuration
3. Verify CORS settings

### WebSocket Not Connecting

**Symptoms:** UI loads but real-time updates don't work.

**Check:**

1. Browser DevTools → Network → WS tab
2. Look for connection attempts to `/api`

**Solutions:**

1. Verify nginx WebSocket headers:

   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

2. Check proxy timeout:
   ```nginx
   proxy_read_timeout 86400;
   ```

## Authentication Issues

### API Key Rejected

**Symptoms:** 401 Unauthorized errors.

**Check:**

```bash
# View configured key (if not hidden)
docker exec automaker-server printenv AUTOMAKER_API_KEY

# Check startup logs for generated key
docker compose logs server | grep "API Key"
```

**Solutions:**

1. Verify key in environment/UI matches server
2. Regenerate key and update both places
3. Restart server after changing key

### Claude CLI Not Authenticated

**Symptoms:** Agent fails with authentication error.

**Check:**

```bash
docker exec -it automaker-server claude --version
docker exec -it automaker-server claude auth status
```

**Solutions:**

1. **Re-authenticate inside container:**

   ```bash
   docker exec -it automaker-server claude login
   ```

2. **Pass credentials via environment:**

   ```bash
   export CLAUDE_OAUTH_CREDENTIALS=$(./scripts/get-claude-token.sh)
   docker compose up -d
   ```

3. **Mount credentials volume:**
   ```yaml
   volumes:
     - ~/.claude:/home/automaker/.claude:ro
   ```

### GitHub Operations Failing

**Symptoms:** Can't clone, push, or create PRs.

**Check:**

```bash
docker exec automaker-server gh auth status
docker exec automaker-server git config --list | grep credential
```

**Solutions:**

1. Set `GH_TOKEN` environment variable:

   ```bash
   export GH_TOKEN=$(gh auth token)
   docker compose up -d
   ```

2. Re-authenticate gh inside container:
   ```bash
   docker exec -it automaker-server gh auth login
   ```

## Volume Issues

### Permission Denied

**Symptoms:** Can't read/write to mounted volumes.

**Check:**

```bash
# Check ownership inside container
docker exec automaker-server ls -la /data
docker exec automaker-server ls -la /path/to/mounted/projects

# Check host ownership
ls -la /path/to/mounted/directory
```

**Solutions:**

1. **Build with matching UID/GID:**

   ```bash
   UID=$(id -u) GID=$(id -g) docker compose build
   ```

2. **Fix permissions manually:**
   ```bash
   sudo chown -R $(id -u):$(id -g) /path/to/directory
   ```

### Data Not Persisting

**Symptoms:** Data lost after container restart.

**Check:**

```bash
# List volumes
docker volume ls | grep automaker

# Inspect volume
docker volume inspect automaker-data
```

**Solutions:**

1. Ensure volume is defined in compose file
2. Don't use `docker compose down -v` (removes volumes)
3. Check you're using named volumes, not anonymous

### Volume Mount Errors

**Symptoms:** Error starting container with volume mount.

**Common causes:**

1. **Path doesn't exist on host:**

   ```bash
   mkdir -p /path/to/directory
   ```

2. **Path mapping mismatch (MCP issue):**

   ```yaml
   # WRONG - paths don't match
   - /projects:/home/youruser/dev

   # CORRECT - container path matches host path
   - /home/youruser/dev:/home/youruser/dev
   ```

## Build Issues

### Build Fails

**Symptoms:** `docker compose build` fails.

**Common causes:**

1. **Network issues:** Can't download packages

   ```bash
   docker compose build --no-cache
   ```

2. **Disk space:**

   ```bash
   docker system prune -a
   ```

3. **Architecture mismatch:** Building for wrong platform
   ```bash
   docker build --platform linux/amd64 .
   ```

### Native Module Errors

**Symptoms:** Errors about `node-pty` or other native modules.

**Solutions:**

1. Rebuild native modules:

   ```bash
   docker compose build --no-cache
   ```

2. In dev mode, clear node_modules volume:
   ```bash
   docker volume rm automaker-dev-node-modules
   ```

## Application Issues

### Agent Not Starting

**Symptoms:** Starting agent does nothing or fails.

**Check:**

```bash
docker compose logs -f server | grep -i agent
```

**Common causes:**

1. Missing Anthropic API key
2. Rate limiting (too many requests)
3. Feature not found (invalid feature ID)

### Terminal Not Working

**Symptoms:** Terminal pane is empty or unresponsive.

**Check:**

1. WebSocket connection (see above)
2. Server logs for PTY errors

**Solutions:**

1. Refresh browser
2. Restart server container
3. Check node-pty is built correctly

### Features Not Loading

**Symptoms:** Board shows empty or features missing.

**Check:**

```bash
# Check project directory exists
docker exec automaker-server ls -la /path/to/project/.automaker/features

# Check API response
curl -H "X-API-Key: KEY" \
  "http://localhost:3008/api/features?projectPath=/path/to/project"
```

## Development Mode Issues

### Live Reload Not Working

**Symptoms:** Changes not reflected without restart.

**Check:**

1. Is source mounted correctly?

   ```bash
   docker exec automaker-dev-server ls -la /app/apps/server/src
   ```

2. Is watch mode running?
   ```bash
   docker compose -f docker-compose.dev.yml logs -f server
   ```

**Solutions:**

1. Check volume mount in compose file
2. Restart with fresh node_modules:
   ```bash
   docker compose -f docker-compose.dev.yml down
   docker volume rm automaker-dev-node-modules
   docker compose -f docker-compose.dev.yml up
   ```

## Getting Help

### Collect Diagnostics

```bash
# System info
docker version
docker compose version
uname -a

# Container status
docker compose ps -a

# Logs
docker compose logs --tail=100 > automaker-logs.txt

# Volume info
docker volume ls | grep automaker
docker inspect automaker-data

# Network info
docker network ls
docker network inspect automaker_default
```

### Log Locations

| Log           | Location                     |
| ------------- | ---------------------------- |
| Server logs   | `docker compose logs server` |
| UI/nginx logs | `docker compose logs ui`     |
| systemd logs  | `journalctl -u automaker`    |

### Report Issues

Include:

1. protoLabs version (git commit)
2. Docker version
3. Operating system
4. Steps to reproduce
5. Relevant logs
6. Compose configuration (without secrets)
