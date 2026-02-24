# Langfuse Setup Guide

This guide walks you through setting up Langfuse integration for the Automaker observability package.

## Table of Contents

- [Overview](#overview)
- [Getting Langfuse Credentials](#getting-langfuse-credentials)
- [Environment Variables](#environment-variables)
- [Configuration Options](#configuration-options)
- [Verifying Setup](#verifying-setup)
- [Self-Hosted Langfuse](#self-hosted-langfuse)

## Overview

The `@protolabs-ai/observability` package integrates with Langfuse for:

- **Prompt Management**: Version and manage prompts in Langfuse
- **Distributed Tracing**: Track agent executions and LLM API calls
- **Analytics**: Monitor costs, latency, and quality metrics

**Important**: Langfuse credentials are **optional**. The package works perfectly without them in fallback mode.

## Getting Langfuse Credentials

### Step 1: Create an Account

1. Go to [https://cloud.langfuse.com](https://cloud.langfuse.com)
2. Sign up with your email or GitHub account
3. Verify your email if required

### Step 2: Create a Project

1. After logging in, click **"New Project"**
2. Enter a project name (e.g., "Automaker Development")
3. Click **"Create Project"**

### Step 3: Get API Keys

1. In your project, click **Settings** in the left sidebar
2. Navigate to **"API Keys"** section
3. Click **"Create new API keys"**
4. Enter a descriptive name (e.g., "Local Development")
5. Click **"Create"**
6. Copy both keys:
   - **Public Key**: `pk-lf-...`
   - **Secret Key**: `sk-lf-...`

⚠️ **Important**: Save the secret key immediately. It's only shown once.

### Step 4: Add to Environment

Add the keys to your project's `.env` file:

```bash
# Langfuse API Keys
LANGFUSE_PUBLIC_KEY=pk-lf-1234567890abcdef
LANGFUSE_SECRET_KEY=sk-lf-1234567890abcdef1234567890abcdef
```

## Environment Variables

The observability package uses the following environment variables:

### Required (for Langfuse integration)

```bash
# Public API key from Langfuse
LANGFUSE_PUBLIC_KEY=pk-lf-...

# Secret API key from Langfuse
LANGFUSE_SECRET_KEY=sk-lf-...
```

### Optional

```bash
# Langfuse API base URL (default: https://cloud.langfuse.com)
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Enable/disable Langfuse (default: true)
LANGFUSE_ENABLED=true

# Request timeout in milliseconds (default: 10000)
LANGFUSE_REQUEST_TIMEOUT=10000

# Flush interval in milliseconds (default: 1000)
LANGFUSE_FLUSH_INTERVAL=1000

# Flush immediately after each event (default: false)
# Warning: Increases latency, only use for debugging
LANGFUSE_FLUSH_AT=false
```

### Example `.env` File

```bash
# Langfuse Configuration
LANGFUSE_PUBLIC_KEY=pk-lf-abc123def456
LANGFUSE_SECRET_KEY=sk-lf-xyz789uvw012
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_ENABLED=true

# Optional: Fine-tuning
LANGFUSE_REQUEST_TIMEOUT=15000
LANGFUSE_FLUSH_INTERVAL=2000
```

## Configuration Options

### Programmatic Configuration

You can configure the Langfuse client programmatically:

```typescript
import { LangfuseClient } from '@protolabs-ai/observability';

const langfuse = new LangfuseClient({
  // API credentials
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,

  // Optional: API endpoint
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',

  // Optional: Enable/disable
  enabled: process.env.LANGFUSE_ENABLED !== 'false',

  // Optional: Request timeout (ms)
  requestTimeout: parseInt(process.env.LANGFUSE_REQUEST_TIMEOUT || '10000'),

  // Optional: Flush interval (ms)
  flushInterval: parseInt(process.env.LANGFUSE_FLUSH_INTERVAL || '1000'),

  // Optional: Flush immediately (debugging only)
  flushAt: process.env.LANGFUSE_FLUSH_AT === 'true',
});
```

### Configuration Best Practices

**Development**:

```bash
LANGFUSE_ENABLED=true
LANGFUSE_FLUSH_INTERVAL=1000  # 1 second
```

**Production**:

```bash
LANGFUSE_ENABLED=true
LANGFUSE_FLUSH_INTERVAL=5000  # 5 seconds for better batching
LANGFUSE_REQUEST_TIMEOUT=15000
```

**CI/Testing**:

```bash
# No credentials needed - fallback mode
LANGFUSE_ENABLED=false
```

## Verifying Setup

### Test with Example

Run the prompt management example to verify your setup:

```bash
npx tsx libs/observability/examples/prompt-management.ts
```

Expected output with valid credentials:

```
🚀 Langfuse Prompt Management Examples

Langfuse Status: ✓ Connected

=== Example 1: Basic Prompt Fetching ===
✓ Loaded prompt from Langfuse
...
```

Expected output without credentials (fallback mode):

```
🚀 Langfuse Prompt Management Examples

Langfuse Status: ✗ Fallback Mode

=== Example 1: Basic Prompt Fetching ===
✓ Using fallback prompt (Langfuse unavailable)
...
```

### Check in Code

```typescript
import { LangfuseClient } from '@protolabs-ai/observability';

const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
});

if (langfuse.isAvailable()) {
  console.log('✓ Langfuse is connected');
} else {
  console.log('✗ Running in fallback mode');
}
```

### View Data in Langfuse

After running examples or your application:

1. Go to [https://cloud.langfuse.com](https://cloud.langfuse.com)
2. Select your project
3. Click **"Traces"** to see logged executions
4. Click **"Prompts"** to manage prompt templates

## Self-Hosted Langfuse

If you're running a self-hosted Langfuse instance:

### Docker Setup

```bash
# Clone Langfuse repository
git clone https://github.com/langfuse/langfuse.git
cd langfuse

# Start with Docker Compose
docker-compose up -d
```

### Configuration

```bash
# Point to your self-hosted instance
LANGFUSE_BASE_URL=http://localhost:3000

# Use your self-hosted API keys
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

### Verify Connection

```typescript
const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: 'http://localhost:3000', // Your self-hosted URL
});

console.log('Connected:', langfuse.isAvailable());
```

## Common Setup Issues

### Issue: "Invalid API key"

**Solution**:

- Verify you copied both public and secret keys correctly
- Check for extra spaces or newlines in `.env` file
- Ensure keys are from the correct project

### Issue: "Connection timeout"

**Solution**:

- Check your internet connection
- Verify `LANGFUSE_BASE_URL` is correct
- Try increasing `LANGFUSE_REQUEST_TIMEOUT`
- Check if Langfuse is accessible: `curl https://cloud.langfuse.com`

### Issue: Events not appearing in Langfuse

**Solution**:

- Wait a few seconds for batching (default flush interval is 1s)
- Call `await langfuse.flush()` to send immediately
- Check the browser console or server logs for errors
- Verify you're looking at the correct project

For more troubleshooting, see [troubleshooting.md](./troubleshooting.md).

## Security Best Practices

### Never Commit Credentials

Add to `.gitignore`:

```
.env
.env.local
.env.*.local
```

### Use Different Keys per Environment

Create separate projects in Langfuse for:

- Local development
- Staging
- Production

### Rotate Keys Regularly

1. Create new API keys in Langfuse
2. Update environment variables
3. Delete old keys after deployment

### Restrict Access

In Langfuse Settings:

- Use role-based access control
- Limit who can view/edit prompts
- Audit API key usage

## Next Steps

- Read the [README.md](../README.md) for usage examples
- Run the examples in `examples/` directory
- Check [troubleshooting.md](./troubleshooting.md) for common issues
- Explore the [Langfuse documentation](https://langfuse.com/docs)
