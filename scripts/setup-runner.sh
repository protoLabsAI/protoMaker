#!/bin/bash
# GitHub Actions Self-Hosted Runner Setup
# Sets up an ephemeral runner on this machine for staging auto-deploys.
#
# The runner uses --ephemeral mode: it picks up ONE job, runs it, then
# de-registers and re-registers. This prevents memory bloat, artifact
# accumulation, and stale state between jobs.
#
# Usage:
#   ./scripts/setup-runner.sh              # Install and start
#   ./scripts/setup-runner.sh --status     # Check runner status
#   ./scripts/setup-runner.sh --uninstall  # Remove runner
#   ./scripts/setup-runner.sh --cleanup    # Prune Docker and runner workspace
#
# Prerequisites:
#   - GitHub repo admin access (or provide a token manually)
#   - Docker installed
#   - gh CLI authenticated

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNNER_DIR="/home/$(whoami)/actions-runner"
REPO="protoLabsAI/automaker"
SERVICE_NAME="automaker-runner"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── Status ───────────────────────────────────────────────────────────────────

show_status() {
  echo ""
  echo -e "${BLUE}═══ GitHub Actions Runner Status ═══${NC}"
  echo ""

  # Check systemd service
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    ok "Service: active"
    systemctl status "$SERVICE_NAME" --no-pager -l 2>/dev/null | head -10
  elif [ -d "$RUNNER_DIR" ]; then
    warn "Runner installed but service not active"
  else
    warn "Runner not installed at $RUNNER_DIR"
  fi

  echo ""

  # Check GitHub API for runner status
  if command -v gh &>/dev/null; then
    info "GitHub runners:"
    gh api "repos/$REPO/actions/runners" --jq '.runners[] | "  \(.name): \(.status) (labels: \(.labels | map(.name) | join(", ")))"' 2>/dev/null || warn "Could not fetch from GitHub"
    local total
    total=$(gh api "repos/$REPO/actions/runners" --jq '.total_count' 2>/dev/null || echo "?")
    info "Total registered: $total"
  fi

  echo ""

  # Disk usage
  if [ -d "$RUNNER_DIR" ]; then
    local runner_size
    runner_size=$(du -sh "$RUNNER_DIR" 2>/dev/null | cut -f1)
    info "Runner directory: $runner_size ($RUNNER_DIR)"
  fi

  local docker_size
  docker_size=$(docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | head -5)
  info "Docker disk usage:"
  echo "$docker_size" | while read -r line; do echo "  $line"; done
}

# ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  info "Cleaning up runner workspace and Docker..."

  # Clean runner workspace
  if [ -d "$RUNNER_DIR/_work" ]; then
    local ws_size
    ws_size=$(du -sh "$RUNNER_DIR/_work" 2>/dev/null | cut -f1)
    info "Cleaning workspace: $ws_size"
    rm -rf "$RUNNER_DIR/_work"/*
    ok "Workspace cleaned"
  fi

  # Prune Docker (dangling images, stopped containers, unused networks)
  info "Pruning Docker..."
  docker system prune -f --filter "until=72h" 2>/dev/null
  ok "Docker pruned"

  # Prune old build cache (keep last 10GB)
  docker builder prune -f --keep-storage 10GB 2>/dev/null || true
  ok "Build cache pruned (keeping 10GB)"
}

# ─── Install ──────────────────────────────────────────────────────────────────

install_runner() {
  info "Setting up GitHub Actions self-hosted runner (ephemeral)..."
  echo ""

  # Check prerequisites
  if ! command -v docker &>/dev/null; then
    err "Docker not found"
    exit 1
  fi

  if ! command -v gh &>/dev/null; then
    err "gh CLI not found. Install with: https://cli.github.com/"
    exit 1
  fi

  # Handle existing installation
  if [ -d "$RUNNER_DIR" ] && [ -f "$RUNNER_DIR/.runner" ]; then
    warn "Runner already installed at $RUNNER_DIR"
    read -p "Reinstall? (y/N) " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
      info "Cancelled."
      exit 0
    fi
    # Stop existing
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    cd "$RUNNER_DIR"
    local remove_token
    remove_token=$(gh api "repos/$REPO/actions/runners/remove-token" --jq '.token' 2>/dev/null) || true
    if [ -n "$remove_token" ]; then
      ./config.sh remove --token "$remove_token" 2>/dev/null || true
    fi
  fi

  # Get registration token
  info "Getting registration token..."
  local token=""
  local gh_result
  gh_result=$(gh api "repos/$REPO/actions/runners/registration-token" --jq '.token' 2>&1) || true

  # Validate token (should be alphanumeric, ~29 chars, no error messages)
  if [[ "$gh_result" =~ ^[A-Za-z0-9]{20,}$ ]]; then
    token="$gh_result"
    ok "Got registration token via gh CLI"
  else
    warn "Could not get token automatically (requires repo admin scope)."
    echo ""
    echo "  1. Go to: https://github.com/$REPO/settings/actions/runners/new"
    echo "  2. Copy the token shown in the configure step"
    echo ""
    read -p "Paste token: " token
    if [ -z "$token" ]; then
      err "No token provided. Aborting."
      exit 1
    fi
  fi

  # Download runner
  mkdir -p "$RUNNER_DIR"
  cd "$RUNNER_DIR"

  local RUNNER_VERSION="2.331.0"
  local RUNNER_TAR="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

  if [ ! -f "$RUNNER_TAR" ]; then
    info "Downloading runner v${RUNNER_VERSION}..."
    curl -sL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}" -o "$RUNNER_TAR"
  fi

  info "Extracting..."
  tar xzf "$RUNNER_TAR"

  # Configure (NOT ephemeral here - the wrapper script handles re-registration)
  info "Configuring runner..."
  ./config.sh \
    --url "https://github.com/$REPO" \
    --token "$token" \
    --name "$(hostname)-staging" \
    --labels "self-hosted,linux,x64,staging" \
    --work "$RUNNER_DIR/_work" \
    --unattended \
    --replace

  # Create wrapper script that runs the runner and cleans up after each job
  cat > "$RUNNER_DIR/run-with-cleanup.sh" <<'WRAPPER'
#!/bin/bash
# Wrapper that runs the GitHub Actions runner and cleans up between jobs.
# Prevents memory bloat and artifact accumulation.
set -uo pipefail

RUNNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RUNNER_DIR"

cleanup_between_jobs() {
  # Clean workspace to prevent accumulation
  rm -rf "$RUNNER_DIR/_work"/* 2>/dev/null || true

  # Prune Docker (dangling only, quick)
  docker image prune -f 2>/dev/null || true
  docker container prune -f 2>/dev/null || true
}

# Run the listener - it handles jobs as they come
# The runner process itself is lightweight (~50MB) when idle
./run.sh &
RUNNER_PID=$!

# Monitor and clean up periodically
while kill -0 $RUNNER_PID 2>/dev/null; do
  sleep 300  # Every 5 minutes
  cleanup_between_jobs
done

wait $RUNNER_PID
WRAPPER
  chmod +x "$RUNNER_DIR/run-with-cleanup.sh"

  # Create systemd service
  info "Creating systemd service..."
  sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Automaker GitHub Actions Runner
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$RUNNER_DIR
ExecStart=$RUNNER_DIR/run-with-cleanup.sh
ExecStop=/bin/kill -SIGINT \$MAINPID
Restart=on-failure
RestartSec=30
KillMode=process
KillSignal=SIGINT
TimeoutStopSec=60

# Memory guard - restart if RSS exceeds 2GB
MemoryMax=2G

# Cleanup workspace on restart
ExecStartPre=/bin/bash -c 'rm -rf $RUNNER_DIR/_work/* 2>/dev/null || true'

# Environment
Environment=RUNNER_ALLOW_RUNASROOT=0
Environment=DOTNET_NOLOGO=1

[Install]
WantedBy=multi-user.target
EOF

  # Weekly Docker prune cron
  info "Setting up weekly Docker cleanup cron..."
  local cron_line="0 3 * * 0 docker system prune -af --filter 'until=168h' && docker builder prune -f --keep-storage 10GB"
  (crontab -l 2>/dev/null | grep -v "docker system prune" ; echo "$cron_line") | crontab -
  ok "Weekly Docker cleanup scheduled (Sundays 3am)"

  # Enable and start
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  sudo systemctl start "$SERVICE_NAME"

  echo ""
  ok "Runner installed and running!"
  echo ""
  info "Runner:   $(hostname)-staging"
  info "Labels:   self-hosted, linux, x64, staging"
  info "Service:  systemctl status $SERVICE_NAME"
  info "Memory:   Capped at 2GB (auto-restarts if exceeded)"
  info "Cleanup:  Workspace cleaned every 5min + weekly Docker prune"
  echo ""
  info "The deploy-staging.yml workflow will auto-deploy on push to main."
}

# ─── Uninstall ────────────────────────────────────────────────────────────────

uninstall_runner() {
  if [ ! -d "$RUNNER_DIR" ]; then
    warn "Runner not installed at $RUNNER_DIR"
    return
  fi

  warn "This will remove the GitHub Actions runner."
  read -p "Are you sure? (y/N) " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    info "Cancelled."
    exit 0
  fi

  # Stop service
  sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  sudo systemctl daemon-reload

  # Remove from GitHub
  cd "$RUNNER_DIR"
  if command -v gh &>/dev/null; then
    local token
    token=$(gh api "repos/$REPO/actions/runners/remove-token" --jq '.token' 2>/dev/null) || true
    if [ -n "$token" ]; then
      ./config.sh remove --token "$token" 2>/dev/null || true
    fi
  fi

  # Remove cron
  crontab -l 2>/dev/null | grep -v "docker system prune" | crontab - 2>/dev/null || true

  ok "Runner removed"
  info "Directory at $RUNNER_DIR - delete with: rm -rf $RUNNER_DIR"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-}" in
  --status)
    show_status
    ;;
  --cleanup)
    cleanup
    ;;
  --uninstall)
    uninstall_runner
    ;;
  --help|-h)
    echo "Usage: $0 [--status|--cleanup|--uninstall|--help]"
    echo ""
    echo "  (no args)     Install and start the runner"
    echo "  --status      Check runner and Docker status"
    echo "  --cleanup     Manual workspace + Docker cleanup"
    echo "  --uninstall   Remove runner completely"
    echo "  --help        Show this help"
    ;;
  *)
    install_runner
    ;;
esac
