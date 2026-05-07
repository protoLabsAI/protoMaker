#!/bin/sh
set -e

# If already running as non-root (e.g. staging with user: directive and reduced caps),
# skip chown/gosu but still handle credential injection and npm cache setup.
if [ "$(id -u)" != "0" ]; then
    # Ensure npm cache directory exists at the configured path.
    # Default to /npm-cache (matching the tmpfs mount in compose) — never default
    # to /home/automaker/.npm, which lives on a small tmpfs and triggered the
    # claude.json corruption issue (see GitHub #3564).
    NPM_CACHE_DIR="${NPM_CONFIG_CACHE:-/npm-cache}"
    if [ ! -d "$NPM_CACHE_DIR" ]; then
        mkdir -p "$NPM_CACHE_DIR" 2>/dev/null || true
    fi

    # Write Claude OAuth credentials if provided (volumes are writable as automaker)
    if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
        mkdir -p /home/automaker/.claude 2>/dev/null || true
        echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/automaker/.claude/.credentials.json
        chmod 600 /home/automaker/.claude/.credentials.json
    fi

    # Persist ~/.claude.json on the named volume so it survives disk pressure
    # on the parent /home/automaker tmpfs. Without this, npm cache or other
    # transient writes can fill the home tmpfs and silently truncate
    # .claude.json mid-write, masquerading as "Invalid or expired API key"
    # errors. See GitHub #3564.
    PERSISTENT_CLAUDE_JSON="/home/automaker/.claude/claude.json"
    if [ ! -L /home/automaker/.claude.json ]; then
        if [ -f /home/automaker/.claude.json ] && [ ! -f "$PERSISTENT_CLAUDE_JSON" ]; then
            cp /home/automaker/.claude.json "$PERSISTENT_CLAUDE_JSON" 2>/dev/null || true
        fi
        [ ! -f "$PERSISTENT_CLAUDE_JSON" ] && echo '{}' > "$PERSISTENT_CLAUDE_JSON"
        rm -f /home/automaker/.claude.json 2>/dev/null || true
        ln -sf "$PERSISTENT_CLAUDE_JSON" /home/automaker/.claude.json
    fi

    # Warn if /home/automaker tmpfs is under pressure — surfaces the underlying
    # condition that caused #3564 before agents start failing.
    HOME_USED_PCT=$(df -P /home/automaker 2>/dev/null | awk 'NR==2 {gsub("%",""); print $5}')
    if [ -n "$HOME_USED_PCT" ] && [ "$HOME_USED_PCT" -ge 80 ]; then
        echo "WARN: /home/automaker is ${HOME_USED_PCT}% full — tmpfs pressure may corrupt CLI configs" >&2
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

# Ensure npm cache directory exists with correct permissions.
# NPM_CONFIG_CACHE may redirect to a tmpfs mount (e.g. /npm-cache) for read-only root fs.
# Default to /npm-cache, NOT /home/automaker/.npm — the latter shares a small tmpfs
# with .claude.json and caused GitHub #3564 (silent credential-file truncation).
NPM_CACHE_DIR="${NPM_CONFIG_CACHE:-/npm-cache}"
if [ ! -d "$NPM_CACHE_DIR" ]; then
    mkdir -p "$NPM_CACHE_DIR"
fi
chown -R automaker:automaker "$NPM_CACHE_DIR"

# Persist ~/.claude.json on the named volume — see GitHub #3564 and the
# matching block in the non-root branch above for the full rationale.
PERSISTENT_CLAUDE_JSON="/home/automaker/.claude/claude.json"
if [ ! -L /home/automaker/.claude.json ]; then
    if [ -f /home/automaker/.claude.json ] && [ ! -f "$PERSISTENT_CLAUDE_JSON" ]; then
        cp /home/automaker/.claude.json "$PERSISTENT_CLAUDE_JSON" 2>/dev/null || true
    fi
    [ ! -f "$PERSISTENT_CLAUDE_JSON" ] && echo '{}' > "$PERSISTENT_CLAUDE_JSON"
    rm -f /home/automaker/.claude.json 2>/dev/null || true
    ln -sf "$PERSISTENT_CLAUDE_JSON" /home/automaker/.claude.json
    chown -h automaker:automaker /home/automaker/.claude.json 2>/dev/null || true
    chown automaker:automaker "$PERSISTENT_CLAUDE_JSON" 2>/dev/null || true
fi

# Warn if /home/automaker tmpfs is under pressure
HOME_USED_PCT=$(df -P /home/automaker 2>/dev/null | awk 'NR==2 {gsub("%",""); print $5}')
if [ -n "$HOME_USED_PCT" ] && [ "$HOME_USED_PCT" -ge 80 ]; then
    echo "WARN: /home/automaker is ${HOME_USED_PCT}% full — tmpfs pressure may corrupt CLI configs" >&2
fi

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

# Switch to automaker user and execute the command
exec gosu automaker "$@"
