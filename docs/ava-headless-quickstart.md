# Ava Headless Monitor — Quick Start Guide

Setup guide for running Ava's autonomous monitoring loop on any environment (local dev, staging, CI).

## Prerequisites

1. **Claude Code CLI** installed and authenticated
2. **Automaker plugin** installed: `claude plugin install automaker`
3. **Environment variables** available in shell:
   - `AUTOMAKER_API_KEY` — authenticates MCP plugin to Automaker server
   - `DISCORD_BOT_TOKEN` — Discord bot auth (for status updates)
   - `ANTHROPIC_API_KEY` — Claude API key (or CLI auth)

4. **Automaker dev server** running on `localhost:3008`
5. **GitHub CLI** (`gh`) authenticated with repo access

## Quick Start

```bash
# Single monitoring pass
./scripts/ava-monitor.sh

# Continuous loop (every 5 minutes)
./scripts/ava-monitor.sh --loop 300

# Background with nohup
nohup ./scripts/ava-monitor.sh --loop 300 > /dev/null 2>&1 &
```

## What Each Pass Does

The `/ava` skill runs these checks in order:

1. **Board State** — Moves stuck features (merged PRs → done, no agent → backlog)
2. **PR Pipeline** — Enables auto-merge, resolves CodeRabbit threads, fixes format/build failures, updates behind branches
3. **Running Agents** — Starts auto-mode if features in backlog, stops stuck agents
4. **Discord Check** — Reads `#ava-josh` for messages from Josh, responds
5. **Report** — Posts brief status to `#dev` channel

## Staging Setup (100.101.189.45)

The staging server runs on CI/CD with auto-deploy on push to main. To add Ava monitoring:

### 1. Ensure Claude Code is installed on staging

```bash
ssh ava  # or ssh user@100.101.189.45
which claude || npm install -g @anthropic-ai/claude-code
```

### 2. Set environment variables

Add to `~/.bashrc` or `~/.zshrc` on staging:

```bash
export AUTOMAKER_API_KEY="<your-key>"
export ANTHROPIC_API_KEY="<your-key>"
export DISCORD_BOT_TOKEN="<your-token>"
```

### 3. Install the Automaker plugin

```bash
cd /path/to/automaker
claude plugin marketplace add $(pwd)/packages/mcp-server/plugins
claude plugin install automaker
```

### 4. Verify the server is running

```bash
curl -s http://localhost:3008/api/health | jq .
# Should return: { "status": "ok", "version": "..." }
```

### 5. Start the monitor

**Option A: systemd service (recommended for staging)**

Create `/etc/systemd/system/ava-monitor.service`:

```ini
[Unit]
Description=Ava Headless Monitor
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/automaker
ExecStart=/path/to/automaker/scripts/ava-monitor.sh --loop 300
Restart=always
RestartSec=30
Environment=AUTOMAKER_API_KEY=<key>
Environment=ANTHROPIC_API_KEY=<key>
Environment=DISCORD_BOT_TOKEN=<token>

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ava-monitor
sudo systemctl start ava-monitor
sudo journalctl -u ava-monitor -f  # Watch logs
```

**Option B: cron (simpler, less robust)**

```bash
# Run every 5 minutes
*/5 * * * * cd /path/to/automaker && ./scripts/ava-monitor.sh >> /var/log/ava-monitor.log 2>&1
```

**Option C: Docker sidecar**

If Automaker runs in Docker, add to `docker-compose.yml`:

```yaml
ava-monitor:
  image: node:22
  working_dir: /app
  volumes:
    - .:/app
  environment:
    - AUTOMAKER_API_KEY=${AUTOMAKER_API_KEY}
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
  command: ./scripts/ava-monitor.sh --loop 300
  depends_on:
    - server
  restart: always
```

## Logs

Logs are stored in `data/ava-monitor-logs/`:

```bash
# View latest log
ls -t data/ava-monitor-logs/pass-*.log | head -1 | xargs cat

# Tail logs in real-time (loop mode)
tail -f data/ava-monitor-logs/pass-*.log
```

Auto-cleaned to last 100 log files.

## Tuning

| Parameter     | Default      | Description                                                   |
| ------------- | ------------ | ------------------------------------------------------------- |
| Loop interval | 300s (5 min) | Time between passes. Lower = more responsive, higher API cost |
| Allowed tools | See script   | Controls what Ava can do autonomously                         |
| Log retention | 100 files    | Number of log files to keep                                   |

## Troubleshooting

**"claude: command not found"**

- Install: `npm install -g @anthropic-ai/claude-code`

**"MCP tool not found"**

- Plugin not installed: `claude plugin install automaker`
- Multiple versions: `claude plugin list` and remove duplicates

**"AUTOMAKER_API_KEY not set"**

- Source env vars: `source ~/.bashrc` or check systemd Environment lines

**"Connection refused to localhost:3008"**

- Automaker server not running. Start it first.

**Pass runs but takes no action**

- Check log file for errors
- Verify `gh auth status` works
- Ensure Discord bot token is valid
