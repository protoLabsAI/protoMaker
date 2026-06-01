#!/bin/sh
set -e

# If already running as non-root (e.g. staging with user: directive and reduced caps),
# skip chown/gosu but still handle credential injection and npm cache setup.
if [ "$(id -u)" != "0" ]; then
    # Ensure npm cache directory exists at the configured path
    NPM_CACHE_DIR="${NPM_CONFIG_CACHE:-/home/automaker/.npm}"
    if [ ! -d "$NPM_CACHE_DIR" ]; then
        mkdir -p "$NPM_CACHE_DIR" 2>/dev/null || true
    fi

    # Write Claude OAuth credentials if provided (volumes are writable as automaker)
    if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
        mkdir -p /home/automaker/.claude 2>/dev/null || true
        echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/automaker/.claude/.credentials.json
        chmod 600 /home/automaker/.claude/.credentials.json
    fi

    # Write Cursor auth token if provided
    if [ -n "$CURSOR_AUTH_TOKEN" ]; then
        CURSOR_CONFIG_DIR="/home/automaker/.config/cursor"
        mkdir -p "$CURSOR_CONFIG_DIR" 2>/dev/null || true
        cat > "$CURSOR_CONFIG_DIR/auth.json" << EOF
{
  "accessToken": "$CURSOR_AUTH_TOKEN"
}
EOF
        chmod 600 "$CURSOR_CONFIG_DIR/auth.json"
    fi

    # Seed proto agent CLI auth-type (#4042). proto requires an explicit auth-type
    # for non-interactive runs; the OpenAI-compatible client routes to OUR gateway
    # via the OPENAI_API_KEY/OPENAI_BASE_URL the server injects (not OpenAI the
    # vendor). Idempotent — never clobbers an existing settings file.
    if [ ! -f "/home/automaker/.proto/settings.json" ]; then
        mkdir -p /home/automaker/.proto 2>/dev/null || true
        printf '%s\n' '{"security":{"auth":{"selectedType":"openai"}},"selectedAuthType":"openai"}' > /home/automaker/.proto/settings.json 2>/dev/null || true
    fi

    # Wire git to authenticate pushes via the gh credential helper, using
    # GH_TOKEN (homelab-iac#126). git-workflow-service does bare `git push origin`,
    # which otherwise has no creds for github.com → 403. gh reads GH_TOKEN.
    if [ -n "$GH_TOKEN" ] || [ -n "$GITHUB_TOKEN" ]; then
        gh auth setup-git 2>/dev/null || true
    fi

    exec "$@"
fi

# Ensure Claude CLI config directory exists with correct permissions
if [ ! -d "/home/automaker/.claude" ]; then
    mkdir -p /home/automaker/.claude
fi

# If CLAUDE_OAUTH_CREDENTIALS is set, write it to the credentials file
# This allows passing OAuth tokens from host (especially macOS where they're in Keychain)
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
    echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/automaker/.claude/.credentials.json
    chmod 600 /home/automaker/.claude/.credentials.json
fi

# Fix permissions on Claude CLI config directory
chown -R automaker:automaker /home/automaker/.claude
chmod 700 /home/automaker/.claude

# Ensure Cursor CLI config directory exists with correct permissions
# This handles both: mounted volumes (owned by root) and empty directories
if [ ! -d "/home/automaker/.cursor" ]; then
    mkdir -p /home/automaker/.cursor
fi
chown -R automaker:automaker /home/automaker/.cursor
chmod -R 700 /home/automaker/.cursor

# Ensure OpenCode CLI config directory exists with correct permissions
# OpenCode stores config and auth in ~/.local/share/opencode/
if [ ! -d "/home/automaker/.local/share/opencode" ]; then
    mkdir -p /home/automaker/.local/share/opencode
fi
chown -R automaker:automaker /home/automaker/.local/share/opencode
chmod -R 700 /home/automaker/.local/share/opencode

# OpenCode also uses ~/.config/opencode for configuration
if [ ! -d "/home/automaker/.config/opencode" ]; then
    mkdir -p /home/automaker/.config/opencode
fi
chown -R automaker:automaker /home/automaker/.config/opencode
chmod -R 700 /home/automaker/.config/opencode

# OpenCode also uses ~/.cache/opencode for cache data (version file, etc.)
if [ ! -d "/home/automaker/.cache/opencode" ]; then
    mkdir -p /home/automaker/.cache/opencode
fi
chown -R automaker:automaker /home/automaker/.cache/opencode
chmod -R 700 /home/automaker/.cache/opencode

# Ensure npm cache directory exists with correct permissions
# NPM_CONFIG_CACHE may redirect to a tmpfs mount (e.g. /npm-cache) for read-only root fs
# This is needed for using npx to run MCP servers
NPM_CACHE_DIR="${NPM_CONFIG_CACHE:-/home/automaker/.npm}"
if [ ! -d "$NPM_CACHE_DIR" ]; then
    mkdir -p "$NPM_CACHE_DIR"
fi
chown -R automaker:automaker "$NPM_CACHE_DIR"

# If CURSOR_AUTH_TOKEN is set, write it to the cursor auth file
# On Linux, cursor-agent uses ~/.config/cursor/auth.json for file-based credential storage
# The env var CURSOR_AUTH_TOKEN is also checked directly by cursor-agent
if [ -n "$CURSOR_AUTH_TOKEN" ]; then
    CURSOR_CONFIG_DIR="/home/automaker/.config/cursor"
    mkdir -p "$CURSOR_CONFIG_DIR"
    # Write auth.json with the access token
    cat > "$CURSOR_CONFIG_DIR/auth.json" << EOF
{
  "accessToken": "$CURSOR_AUTH_TOKEN"
}
EOF
    chmod 600 "$CURSOR_CONFIG_DIR/auth.json"
    chown -R automaker:automaker /home/automaker/.config
fi

# Seed proto agent CLI auth-type (#4042). proto requires an explicit auth-type
# for non-interactive runs; the OpenAI-compatible client routes to OUR gateway via
# the OPENAI_API_KEY/OPENAI_BASE_URL the server injects (not OpenAI the vendor).
# Idempotent — never clobbers an existing settings file.
if [ ! -f "/home/automaker/.proto/settings.json" ]; then
    mkdir -p /home/automaker/.proto
    printf '%s\n' '{"security":{"auth":{"selectedType":"openai"}},"selectedAuthType":"openai"}' > /home/automaker/.proto/settings.json
fi
chown -R automaker:automaker /home/automaker/.proto

# Wire git to authenticate pushes via the gh credential helper, using GH_TOKEN
# (homelab-iac#126). Run as automaker so it lands in /home/automaker/.gitconfig.
# git-workflow-service does bare `git push origin`, which otherwise has no creds
# for github.com → 403. gh reads GH_TOKEN.
if [ -n "$GH_TOKEN" ] || [ -n "$GITHUB_TOKEN" ]; then
    gosu automaker gh auth setup-git 2>/dev/null || true
fi

# Switch to automaker user and execute the command
exec gosu automaker "$@"
