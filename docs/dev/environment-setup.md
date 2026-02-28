# Environment Setup

This guide covers the required environment variables, API keys, and configuration needed to run protoLabs Studio locally or in production.

## Prerequisites

Before setting up protoLabs Studio, ensure you have:

- **Node.js** 20.x or later
- **npm** 10.x or later
- **Git** 2.x or later
- **Anthropic API key** (for Claude models)
- **GitHub account** (for repository operations)
- **Discord bot** (optional, for Discord integration)

## Environment Variables

protoLabs Studio uses environment variables for configuration. Create a `.env` file in the project root:

```bash
cp .env.example .env
```

### Required Variables

#### Anthropic API Key

**Variable:** `ANTHROPIC_API_KEY`
**Description:** Anthropic API key for Claude models
**How to get:** https://console.anthropic.com/settings/keys

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Alternative:** Use Claude Code CLI authentication:

```bash
claude auth login
# No need to set ANTHROPIC_API_KEY if using CLI auth
```

### Server Configuration

#### Host and Port

**Variables:** `HOST`, `HOSTNAME`, `PORT`
**Description:** Server binding and user-facing URLs
**Defaults:** `HOST=0.0.0.0`, `HOSTNAME=localhost`, `PORT=3008`

```bash
# Development
HOST=0.0.0.0
HOSTNAME=localhost
PORT=3008

# Production
HOST=0.0.0.0
HOSTNAME=protolabs.example.com
PORT=3008
```

**Note:** `HOST` is the binding address (use `0.0.0.0` for all interfaces), while `HOSTNAME` is used in generated URLs.

#### Frontend Hostname

**Variable:** `VITE_HOSTNAME`
**Description:** Hostname for frontend API URLs
**Default:** `localhost`

```bash
# Development
VITE_HOSTNAME=localhost

# Production
VITE_HOSTNAME=protolabs.example.com
```

### Data Storage

#### Data Directory

**Variable:** `DATA_DIR`
**Description:** Data storage directory for settings, credentials, and sessions
**Default:** `./data`

```bash
DATA_DIR=./data
```

**Directory structure:**

```
data/
├── settings.json          # Global settings
├── credentials.json       # API keys
├── sessions-metadata.json # Chat sessions
└── agent-sessions/        # Conversation histories
```

#### Allowed Root Directory

**Variable:** `ALLOWED_ROOT_DIRECTORY`
**Description:** Restrict file operations to specific directory (security feature)
**Default:** None (no restriction)

```bash
# Restrict to specific directory
ALLOWED_ROOT_DIRECTORY=/home/user/projects
```

### GitHub Integration

#### GitHub Token

**Variable:** `GITHUB_TOKEN`
**Description:** GitHub personal access token for repository operations
**How to get:** https://github.com/settings/tokens/new

**Required scopes:**

- `repo` - Full control of private repositories
- `read:org` - Read org and team membership (if using organizations)

```bash
GITHUB_TOKEN=ghp_...
```

#### GitHub Repository

**Variables:** `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`
**Description:** Default GitHub repository for operations

```bash
GITHUB_REPO_OWNER=protolabs-ai
GITHUB_REPO_NAME=automaker
```

### Observability (Langfuse)

#### Langfuse Keys

**Variables:** `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
**Description:** Langfuse API keys for observability and tracing
**How to get:** https://cloud.langfuse.com/settings

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

#### Langfuse Configuration

**Variable:** `LANGFUSE_BASE_URL`
**Description:** Langfuse API URL
**Default:** `https://cloud.langfuse.com`

```bash
# Cloud (default)
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Self-hosted
LANGFUSE_BASE_URL=https://langfuse.example.com
```

#### Langfuse Webhook

**Variable:** `LANGFUSE_WEBHOOK_SECRET`
**Description:** Webhook secret for verifying Langfuse webhook payloads
**How to get:** Generate in Langfuse project settings

```bash
LANGFUSE_WEBHOOK_SECRET=whsec_...
```

#### Langfuse Sync Configuration

**Variables:** `LANGFUSE_SYNC_LABEL`, `LANGFUSE_SYNC_CI_TRIGGER`
**Description:** Prompt sync configuration for production prompts

```bash
# Only sync prompts with this label
LANGFUSE_SYNC_LABEL=production

# Trigger GitHub Actions after sync (true/1 to enable)
LANGFUSE_SYNC_CI_TRIGGER=true
```

### Discord Integration

#### Discord Bot Token

**Variable:** `DISCORD_TOKEN`
**Description:** Discord bot token for event routing and notifications
**How to get:** https://discord.com/developers/applications

**Required bot permissions:**

- Send Messages
- Read Message History
- Add Reactions
- Embed Links

```bash
DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ...
```

#### Discord Server ID

**Variable:** `DISCORD_GUILD_ID`
**Description:** Discord server (guild) ID

```bash
DISCORD_GUILD_ID=1234567890123456789
```

#### Discord Channels

**Variables:** Channel IDs for specific purposes

```bash
DISCORD_CHANNEL_SUGGESTIONS=1234567890123456789
DISCORD_CHANNEL_PROJECT_PLANNING=1234567890123456789
DISCORD_CHANNEL_AGENT_LOGS=1234567890123456789
DISCORD_CHANNEL_CODE_REVIEW=1234567890123456789
DISCORD_CHANNEL_INFRA=1234567890123456789
```

**How to get channel IDs:**

1. Enable Developer Mode in Discord (User Settings → Advanced)
2. Right-click channel → Copy ID

### Testing and Development

#### Mock Agent Mode

**Variable:** `AUTOMAKER_MOCK_AGENT`
**Description:** Enable mock agent mode for CI testing (no real API calls)
**Default:** `false`

```bash
# Enable for CI/testing
AUTOMAKER_MOCK_AGENT=true
```

#### Auto Login

**Variable:** `AUTOMAKER_AUTO_LOGIN`
**Description:** Skip login prompt in development
**Default:** `false` (disabled in production)

```bash
# Enable for development
AUTOMAKER_AUTO_LOGIN=true
```

**Security:** This is automatically disabled when `NODE_ENV=production`.

## Configuration Files

### Global Settings

**File:** `data/settings.json`

```json
{
  "defaultModel": "sonnet",
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_KEY": "..."
      }
    }
  },
  "promptCustomization": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

### Project Settings

**File:** `.automaker/settings.json` (per-project)

```json
{
  "projectPath": "/path/to/project",
  "defaultModel": "sonnet",
  "complexityThresholds": {
    "small": "haiku",
    "medium": "sonnet",
    "large": "sonnet",
    "architectural": "opus"
  }
}
```

### Credentials

**File:** `data/credentials.json`

```json
{
  "anthropic": {
    "apiKey": "sk-ant-api03-..."
  },
  "github": {
    "token": "ghp_..."
  },
  "discord": {
    "token": "MTIzNDU2Nzg5..."
  }
}
```

**Security:** This file contains sensitive data. Add to `.gitignore`.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build Packages

```bash
npm run build:packages
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE" >> .env
```

### 4. Start Development Server

```bash
# Interactive launcher
npm run dev

# Or start web directly
npm run dev:web

# Or start Electron
npm run dev:electron
```

### 5. Verify Setup

Visit http://localhost:3007 to access the UI.

## Production Setup

### 1. Set Node Environment

```bash
export NODE_ENV=production
```

### 2. Configure Production Variables

```bash
# .env.production
NODE_ENV=production
HOST=0.0.0.0
HOSTNAME=protolabs.example.com
PORT=3008
ANTHROPIC_API_KEY=sk-ant-api03-...
GITHUB_TOKEN=ghp_...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

### 3. Build for Production

```bash
npm run build:packages
npm run build:server
npm run build
```

### 4. Start Production Server

```bash
npm run start:server
```

### 5. Optional: Use Process Manager

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start npm --name "automaker-server" -- run start:server
pm2 save
pm2 startup
```

## Docker Setup

### Using Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  automaker:
    build: .
    ports:
      - '3007:3007'
      - '3008:3008'
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
      - ./projects:/app/projects
```

## Troubleshooting

### \"API key not found\"

**Issue:** `ANTHROPIC_API_KEY` is missing or invalid.

**Solution:** Verify API key is set:

```bash
echo $ANTHROPIC_API_KEY
# Should print your API key

# Or check .env file
cat .env | grep ANTHROPIC_API_KEY
```

### \"Port already in use\"

**Issue:** Port 3008 is already bound.

**Solution:** Change port or kill existing process:

```bash
# Change port
export PORT=3009

# Or kill existing process
lsof -ti:3008 | xargs kill
```

### \"Cannot connect to server\"

**Issue:** Frontend can't reach backend.

**Solution:** Verify `VITE_HOSTNAME` matches your backend hostname:

```bash
# For local development
VITE_HOSTNAME=localhost

# For production
VITE_HOSTNAME=protolabs.example.com
```

### \"Langfuse connection failed\"

**Issue:** Langfuse keys are invalid or network issue.

**Solution:** Verify keys and connectivity:

```bash
# Test Langfuse connection
curl -H "Authorization: Bearer ${LANGFUSE_PUBLIC_KEY}" \
  https://cloud.langfuse.com/api/public/health
```

### \"Discord bot not responding\"

**Issue:** Bot token is invalid or permissions are insufficient.

**Solution:**

1. Verify bot token is correct
2. Check bot has required permissions (Send Messages, Read Message History)
3. Ensure bot is invited to server with correct scopes

## Security Best Practices

### 1. Never Commit Secrets

Add to `.gitignore`:

```
.env
.env.*
data/credentials.json
data/settings.json
```

### 2. Use Environment-Specific Files

```bash
.env.development
.env.production
.env.test
```

### 3. Rotate Keys Regularly

- Rotate API keys every 90 days
- Rotate GitHub tokens annually
- Use scoped tokens with minimal permissions

### 4. Restrict File Access

Use `ALLOWED_ROOT_DIRECTORY` to limit file operations:

```bash
ALLOWED_ROOT_DIRECTORY=/home/automaker/projects
```

### 5. Use Secrets Management (Production)

For production, use:

- **AWS Secrets Manager**
- **HashiCorp Vault**
- **Azure Key Vault**
- **Google Secret Manager**

## Learn More

- [Monorepo Architecture](./monorepo-architecture.md) - Package structure
- [Git Workflow](./git-workflow.md) - Branch strategies
- [MCP Tools](../integrations/mcp-tools-reference.md) - MCP server configuration
- [Infrastructure Deployment](../infra/deployment.md) - Production deployment guide
