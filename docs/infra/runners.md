# Self-hosted runners

protoLabs CI/CD runs on self-hosted GitHub Actions runners rather than GitHub-hosted runners. This gives agents access to the Claude CLI, Docker, large RAM allocations, and persistent workspace caching that GitHub-hosted runners cannot provide.

## Why self-hosted

| Requirement       | GitHub-hosted     | Self-hosted                     |
| ----------------- | ----------------- | ------------------------------- |
| Claude CLI auth   | Not possible      | Persisted on host               |
| Docker access     | Limited           | Full                            |
| RAM per job       | 7 GB max          | Configurable (8–48 GB)          |
| Workspace caching | Ephemeral         | Persistent between jobs         |
| Concurrent jobs   | Billed per minute | Unlimited (hardware permitting) |

## Directory layout

Runners are installed as siblings under a shared directory:

```
/home/YOUR_USERNAME/actions-runners/
├── cleanup-hook.sh          # Post-job cleanup hook (shared by all runners)
├── runner-1/                # Each runner is an independent installation
│   ├── .runner              # Registration metadata
│   ├── .env                 # Runner env vars (including hook path)
│   └── run.sh               # Start script
├── runner-2/
├── runner-3/
└── ...
```

Each runner registers independently with GitHub. They appear as separate runners in the GitHub repository settings but draw from the same job queue with the `self-hosted` label.

## Setting up runners

### Prerequisites

- Node.js v20+ (install via nvm: `nvm install --lts`)
- `git`, `gh` CLI, `docker` installed on the host
- `build-essential` (provides `make`, `gcc`, `g++`) — required for node-gyp native module compilation: `sudo apt-get install -y build-essential python3-dev`
- A GitHub registration token from **Settings → Actions → Runners → New self-hosted runner**

> **Note:** If `make` is missing the CI `setup-project` action will attempt to install `build-essential` automatically via `apt-get`, but this requires the runner user to have passwordless `sudo` access. It is strongly recommended to pre-install `build-essential` on every runner host to avoid per-job package installation overhead.

### Install a single runner

```bash
# Create directory for this runner instance
mkdir -p /home/YOUR_USERNAME/actions-runners/runner-N
cd /home/YOUR_USERNAME/actions-runners/runner-N

# Download the runner binary (check https://github.com/actions/runner/releases for latest)
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
rm actions-runner-linux-x64.tar.gz

# Register with GitHub (get token from repo Settings → Actions → Runners)
./config.sh \
  --url https://github.com/YOUR_ORG/YOUR_REPO \
  --token YOUR_REGISTRATION_TOKEN \
  --name runner-N \
  --labels self-hosted \
  --unattended

# Wire up the cleanup hook
echo 'ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/home/YOUR_USERNAME/actions-runners/cleanup-hook.sh' \
  >> /home/YOUR_USERNAME/actions-runners/runner-N/.env
```

### Create a systemd service

Create `/etc/systemd/system/automaker-runner-N.service`:

```ini
[Unit]
Description=Automaker GitHub Actions Runner N
After=network.target

[Service]
ExecStart=/home/YOUR_USERNAME/actions-runners/runner-N/run.sh
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/actions-runners/runner-N
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=60
Restart=always
RestartSec=5
MemoryMax=8G

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable automaker-runner-N
sudo systemctl start automaker-runner-N
```

### Scripted setup for multiple runners

When provisioning many runners at once, loop over a range. Adjust `START`, `END`, and paths for your environment:

```bash
#!/bin/bash
set -euo pipefail

RUNNERS_DIR="/home/YOUR_USERNAME/actions-runners"
RUNNER_URL="https://github.com/YOUR_ORG/YOUR_REPO"
REGISTRATION_TOKEN="YOUR_TOKEN"  # from GitHub Settings → Actions → Runners
RUNNER_VERSION="2.321.0"
START=9
END=18

mkdir -p "$RUNNERS_DIR"

for N in $(seq "$START" "$END"); do
  DIR="$RUNNERS_DIR/runner-$N"
  mkdir -p "$DIR"

  # Download binary
  curl -o "$DIR/runner.tar.gz" -L \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  tar xzf "$DIR/runner.tar.gz" -C "$DIR"
  rm "$DIR/runner.tar.gz"

  # Register
  "$DIR/config.sh" \
    --url "$RUNNER_URL" \
    --token "$REGISTRATION_TOKEN" \
    --name "runner-$N" \
    --labels self-hosted \
    --unattended

  # Wire cleanup hook
  echo "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=${RUNNERS_DIR}/cleanup-hook.sh" >> "$DIR/.env"

  # Create systemd unit
  sudo tee "/etc/systemd/system/automaker-runner-${N}.service" > /dev/null <<EOF
[Unit]
Description=Automaker GitHub Actions Runner ${N}
After=network.target

[Service]
ExecStart=${DIR}/run.sh
User=${USER}
WorkingDirectory=${DIR}
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=60
Restart=always
RestartSec=5
MemoryMax=8G

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "automaker-runner-${N}"
  sudo systemctl start "automaker-runner-${N}"

  echo "Runner $N started"
done
```

> **Note:** Each runner registration uses the same token. Tokens expire after one hour — generate a fresh one if registrations start failing.

## Post-job cleanup hook

Without cleanup, build artifacts accumulate across jobs and slowly fill the disk. The hook runs after every completed job:

```bash
#!/bin/bash
# /home/YOUR_USERNAME/actions-runners/cleanup-hook.sh

WORKSPACE="${GITHUB_WORKSPACE:-}"
if [ -z "$WORKSPACE" ] || [ ! -d "$WORKSPACE" ]; then
  exit 0
fi

# Remove root and app-level node_modules
rm -rf "$WORKSPACE/node_modules" 2>/dev/null || true
rm -rf "$WORKSPACE/apps/ui/node_modules" 2>/dev/null || true
rm -rf "$WORKSPACE/apps/server/node_modules" 2>/dev/null || true

# Remove build outputs
rm -rf "$WORKSPACE/apps/ui/dist" 2>/dev/null || true
rm -rf "$WORKSPACE/apps/server/dist" 2>/dev/null || true

# Remove shared package build outputs (libs/*/dist accumulates across jobs)
find "$WORKSPACE/libs" -maxdepth 2 -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true

# Keep .git for faster incremental fetches on next checkout
```

Each runner's `.env` file activates this hook:

```
ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/home/YOUR_USERNAME/actions-runners/cleanup-hook.sh
```

## Concurrency and memory limits

### Per-runner memory cap

Each runner service sets `MemoryMax=8G`. This prevents a runaway build job from consuming all available RAM and destabilising other runners on the same host.

### Concurrent agent limit

Automaker agents (Claude Sonnet, Opus) allocate significant RAM per instance. Rough allocations:

| Model  | RAM per agent | Max safe concurrent |
| ------ | ------------- | ------------------- |
| Haiku  | ~2 GB         | 20                  |
| Sonnet | ~4 GB         | 10                  |
| Opus   | ~6 GB         | 8                   |

**Critical threshold: do not exceed 13 concurrent agents.** Above this the server process will crash due to V8 heap exhaustion. This is enforced in the server's `maxConcurrency` setting (default: 6).

### Sizing guidance

| Host RAM | Recommended runners | Notes                                   |
| -------- | ------------------- | --------------------------------------- |
| 32 GB    | 4                   | Leaves room for OS + Docker stack       |
| 64 GB    | 6–8                 | Comfortable for mixed Sonnet/Haiku load |
| 128 GB   | 10–12               | Full concurrent agent capacity          |

## Management

### Check all runner services

```bash
# Status of all runners at once
systemctl status 'automaker-runner-*'

# Follow logs for a specific runner
journalctl -u automaker-runner-3 -f

# Restart a single runner
sudo systemctl restart automaker-runner-3
```

### Verify GitHub registration

Check that all runners show as **Online** in **GitHub → Settings → Actions → Runners**. A runner showing as **Offline** usually means:

1. The systemd service failed to start — check `systemctl status automaker-runner-N`
2. The service unit points to a missing `run.sh` — verify `ExecStart` path
3. The registration was removed from GitHub — re-register with a fresh token

### Remove a runner

```bash
# Stop and disable the service
sudo systemctl stop automaker-runner-N
sudo systemctl disable automaker-runner-N
sudo rm /etc/systemd/system/automaker-runner-N.service
sudo systemctl daemon-reload

# Remove GitHub registration
cd /home/YOUR_USERNAME/actions-runners/runner-N
./config.sh remove --token YOUR_REMOVAL_TOKEN
```

## Next steps

- **[CI/CD](./ci-cd)** — Workflow definitions and what each workflow does
- **[High-concurrency deployment](./staging-deployment)** — Tuning the server for many concurrent agents
- **[Troubleshooting](./troubleshooting)** — Common container and infrastructure issues
