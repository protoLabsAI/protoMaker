# Troubleshooting Guide

This guide helps you diagnose and fix common issues with the `@protolabs-ai/observability` package and Langfuse integration.

## Table of Contents

- [Authentication Issues](#authentication-issues)
- [Network and Connectivity](#network-and-connectivity)
- [Event Delivery Problems](#event-delivery-problems)
- [Performance Issues](#performance-issues)
- [Configuration Errors](#configuration-errors)
- [API Rate Limiting](#api-rate-limiting)
- [Debugging Tips](#debugging-tips)

## Authentication Issues

### Error: "Invalid API key"

**Symptoms**:

- Connection fails with authentication error
- `isAvailable()` returns `false`
- Console shows: "Authentication failed"

**Possible Causes**:

1. Wrong API keys
2. Keys from wrong project
3. Extra spaces in environment variables
4. Keys expired or deleted

**Solutions**:

1. **Verify API Keys**:

   ```bash
   # Check if keys are set
   echo $LANGFUSE_PUBLIC_KEY
   echo $LANGFUSE_SECRET_KEY
   ```

2. **Check for Extra Spaces**:

   ```bash
   # .env should not have quotes or spaces
   # ❌ Wrong
   LANGFUSE_PUBLIC_KEY=" pk-lf-123 "

   # ✓ Correct
   LANGFUSE_PUBLIC_KEY=pk-lf-123
   ```

3. **Regenerate Keys**:
   - Go to Langfuse Settings → API Keys
   - Delete old keys
   - Create new keys
   - Update `.env` file

4. **Verify Project**:
   - Ensure keys are from the correct Langfuse project
   - Check project name in Langfuse dashboard

### Error: "Unauthorized" or 401

**Symptoms**:

- API calls return 401 status
- Events not appearing in Langfuse

**Solutions**:

1. **Check Secret Key**:

   ```bash
   # Secret key must start with sk-lf-
   echo $LANGFUSE_SECRET_KEY | grep "^sk-lf-"
   ```

2. **Verify Public Key**:

   ```bash
   # Public key must start with pk-lf-
   echo $LANGFUSE_PUBLIC_KEY | grep "^pk-lf-"
   ```

3. **Test with curl**:
   ```bash
   curl -X POST https://cloud.langfuse.com/api/public/ingestion \
     -H "Content-Type: application/json" \
     -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
     -d '{"batch": []}'
   ```

## Network and Connectivity

### Error: "Connection timeout"

**Symptoms**:

- Operations hang or timeout
- `ECONNREFUSED` or `ETIMEDOUT` errors

**Solutions**:

1. **Check Internet Connection**:

   ```bash
   # Test basic connectivity
   curl https://cloud.langfuse.com
   ```

2. **Verify Base URL**:

   ```bash
   # Check if LANGFUSE_BASE_URL is correct
   echo $LANGFUSE_BASE_URL

   # Should be https://cloud.langfuse.com (default)
   # Or your self-hosted URL
   ```

3. **Increase Timeout**:

   ```bash
   # In .env
   LANGFUSE_REQUEST_TIMEOUT=30000  # 30 seconds
   ```

4. **Check Firewall/Proxy**:
   - Ensure outbound HTTPS (port 443) is allowed
   - Configure proxy if needed:
     ```bash
     export HTTPS_PROXY=http://proxy.company.com:8080
     ```

### Error: "DNS resolution failed"

**Symptoms**:

- `ENOTFOUND` or `ENOENT` errors
- Cannot reach Langfuse servers

**Solutions**:

1. **Check DNS**:

   ```bash
   # Verify DNS can resolve Langfuse
   nslookup cloud.langfuse.com
   ```

2. **Try Alternative DNS**:

   ```bash
   # Use Google DNS temporarily
   export DNS_SERVER=8.8.8.8
   ```

3. **Use IP Address** (temporary):
   ```typescript
   // Only for debugging
   baseUrl: 'https://104.21.x.x'; // Replace with actual IP
   ```

## Event Delivery Problems

### Events Not Appearing in Langfuse

**Symptoms**:

- Code runs without errors
- No traces visible in Langfuse dashboard
- Dashboard shows empty state

**Solutions**:

1. **Wait for Batching**:

   ```typescript
   // Events are batched by default (1 second)
   await langfuse.flush(); // Force immediate send
   await langfuse.shutdown(); // Ensure all sent before exit
   ```

2. **Check if Enabled**:

   ```typescript
   if (!langfuse.isAvailable()) {
     console.log('Langfuse is disabled or unavailable');
   }
   ```

3. **Verify Environment**:

   ```bash
   # Ensure not disabled
   LANGFUSE_ENABLED=true  # Should be true or unset
   ```

4. **Check Browser Console** (for frontend):
   - Open DevTools
   - Look for network errors to Langfuse API
   - Check for CORS issues

5. **Look at Server Logs**:
   ```bash
   # Enable debug logging
   DEBUG=langfuse:* npm start
   ```

### Partial Event Loss

**Symptoms**:

- Some events appear, others don't
- Intermittent delivery

**Solutions**:

1. **Increase Flush Interval**:

   ```bash
   # Give more time for batching
   LANGFUSE_FLUSH_INTERVAL=5000  # 5 seconds
   ```

2. **Check for Early Exit**:

   ```typescript
   // Always shutdown properly
   process.on('SIGINT', async () => {
     await langfuse.flush();
     await langfuse.shutdown();
     process.exit(0);
   });
   ```

3. **Reduce Batch Size**:
   ```bash
   # Flush more frequently
   LANGFUSE_FLUSH_AT=true  # Warning: Increases latency
   ```

## Performance Issues

### High Latency

**Symptoms**:

- Slow API responses
- Application feels sluggish

**Solutions**:

1. **Use Async Patterns**:

   ```typescript
   // ✓ Good - non-blocking
   langfuse.createTrace({ name: 'test' });

   // ✗ Bad - blocks on every event
   langfuse = new LangfuseClient({ flushAt: true });
   ```

2. **Increase Batch Interval**:

   ```bash
   LANGFUSE_FLUSH_INTERVAL=5000  # Batch for 5 seconds
   ```

3. **Check Network**:

   ```bash
   # Measure latency to Langfuse
   curl -w "@curl-format.txt" -o /dev/null -s https://cloud.langfuse.com
   ```

4. **Consider Self-Hosting**:
   - Host Langfuse closer to your infrastructure
   - Reduces network latency

### Memory Issues

**Symptoms**:

- High memory usage
- Out of memory errors

**Solutions**:

1. **Flush Regularly**:

   ```typescript
   // Flush every N traces
   if (traceCount % 100 === 0) {
     await langfuse.flush();
   }
   ```

2. **Reduce Metadata Size**:

   ```typescript
   // ✗ Bad - large objects
   metadata: {
     entireCodebase: bigString,  // Don't log huge data
   }

   // ✓ Good - summary data
   metadata: {
     linesChanged: 42,
     filesModified: 5,
   }
   ```

3. **Limit Input/Output Size**:

   ```typescript
   // Truncate large strings
   const truncate = (str: string, max = 10000) =>
     str.length > max ? str.slice(0, max) + '...' : str;

   langfuse.createGeneration({
     input: truncate(largeInput),
     output: truncate(largeOutput),
   });
   ```

## Configuration Errors

### Error: "Missing required configuration"

**Symptoms**:

- TypeScript errors
- Runtime configuration errors

**Solutions**:

1. **Check Required Fields**:

   ```typescript
   // Minimum config (fallback mode)
   new LangfuseClient({});

   // Full config (Langfuse enabled)
   new LangfuseClient({
     publicKey: process.env.LANGFUSE_PUBLIC_KEY,
     secretKey: process.env.LANGFUSE_SECRET_KEY,
   });
   ```

2. **Validate Environment**:

   ```typescript
   const config = {
     publicKey: process.env.LANGFUSE_PUBLIC_KEY,
     secretKey: process.env.LANGFUSE_SECRET_KEY,
   };

   if (!config.publicKey || !config.secretKey) {
     console.warn('Langfuse credentials missing - running in fallback mode');
   }
   ```

### Invalid Base URL

**Symptoms**:

- Cannot connect
- Wrong endpoint errors

**Solutions**:

1. **Check URL Format**:

   ```bash
   # ✓ Correct
   LANGFUSE_BASE_URL=https://cloud.langfuse.com

   # ✗ Wrong
   LANGFUSE_BASE_URL=cloud.langfuse.com  # Missing protocol
   LANGFUSE_BASE_URL=https://cloud.langfuse.com/  # Trailing slash
   ```

2. **For Self-Hosted**:
   ```bash
   # Include protocol and port if needed
   LANGFUSE_BASE_URL=http://localhost:3000
   LANGFUSE_BASE_URL=https://langfuse.company.com
   ```

## API Rate Limiting

### Error: "Rate limit exceeded" or 429

**Symptoms**:

- HTTP 429 responses
- Errors about too many requests

**Solutions**:

1. **Increase Flush Interval**:

   ```bash
   # Batch more events together
   LANGFUSE_FLUSH_INTERVAL=10000  # 10 seconds
   ```

2. **Implement Backoff**:

   ```typescript
   // Langfuse SDK handles retries automatically
   // But you can add custom logic if needed
   ```

3. **Check Usage**:
   - Go to Langfuse Settings → Usage
   - Review your API call volume
   - Upgrade plan if needed

4. **Optimize Event Volume**:
   ```typescript
   // Only log important operations
   if (importance === 'high') {
     langfuse.createTrace({ ... });
   }
   ```

## Debugging Tips

### Enable Debug Logging

```bash
# Enable Langfuse SDK debug logs
DEBUG=langfuse:* npm start

# Or in code
process.env.DEBUG = 'langfuse:*';
```

### Check Langfuse Status

```typescript
import { LangfuseClient } from '@protolabs-ai/observability';

const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
});

console.log('Available:', langfuse.isAvailable());
console.log('Config:', {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY?.slice(0, 10) + '...',
  baseUrl: process.env.LANGFUSE_BASE_URL || 'default',
  enabled: process.env.LANGFUSE_ENABLED !== 'false',
});
```

### Test Minimal Example

```typescript
// minimal-test.ts
import { LangfuseClient } from '@protolabs-ai/observability';

async function test() {
  const langfuse = new LangfuseClient({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
  });

  console.log('1. Client created');
  console.log('2. Available?', langfuse.isAvailable());

  const trace = langfuse.createTrace({
    name: 'Test Trace',
  });

  console.log('3. Trace created?', !!trace);

  await langfuse.flush();
  console.log('4. Flushed');

  await langfuse.shutdown();
  console.log('5. Shutdown complete');
  console.log('6. Check Langfuse dashboard for "Test Trace"');
}

test().catch(console.error);
```

### Verify with curl

```bash
# Test Langfuse API directly
curl -X POST https://cloud.langfuse.com/api/public/ingestion \
  -H "Content-Type: application/json" \
  -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
  -d '{
    "batch": [
      {
        "id": "test-trace-1",
        "type": "trace-create",
        "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
        "body": {
          "id": "test-trace-1",
          "name": "Test Trace"
        }
      }
    ]
  }'
```

### Check Langfuse Health

```bash
# Verify Langfuse is operational
curl https://cloud.langfuse.com/api/public/health

# Should return: {"status":"ok"}
```

## Getting Help

If you're still experiencing issues:

1. **Check Langfuse Status**: [status.langfuse.com](https://status.langfuse.com)
2. **Review Logs**: Check server and application logs for errors
3. **Consult Docs**: [langfuse.com/docs](https://langfuse.com/docs)
4. **Community Support**: [Langfuse Discord](https://discord.gg/7NXusRtqYU)
5. **GitHub Issues**: [github.com/langfuse/langfuse](https://github.com/langfuse/langfuse/issues)

When reporting issues, include:

- Error messages (full stack trace)
- Configuration (redact secret keys)
- Steps to reproduce
- Expected vs actual behavior
- Langfuse SDK version

## Common Mistakes

### Mistake 1: Not Calling flush()

```typescript
// ✗ Wrong - events may not be sent
langfuse.createTrace({ name: 'test' });
process.exit(0); // Events lost!

// ✓ Correct
langfuse.createTrace({ name: 'test' });
await langfuse.flush();
await langfuse.shutdown();
process.exit(0);
```

### Mistake 2: Blocking on Every Event

```typescript
// ✗ Wrong - high latency
const langfuse = new LangfuseClient({ flushAt: true });

// ✓ Correct - batched async
const langfuse = new LangfuseClient({ flushInterval: 1000 });
```

### Mistake 3: Logging Sensitive Data

```typescript
// ✗ Wrong - logs API keys
langfuse.createGeneration({
  input: `API_KEY=${process.env.API_KEY}`,
});

// ✓ Correct - redact sensitive data
langfuse.createGeneration({
  input: 'API_KEY=[REDACTED]',
});
```

### Mistake 4: No Fallback Prompts

```typescript
// ✗ Wrong - breaks without Langfuse
const prompt = await langfuse.getPrompt('my-prompt');
const text = prompt.prompt; // null if unavailable!

// ✓ Correct - always works
const prompt = await langfuse.getPrompt('my-prompt');
const text = prompt?.prompt || 'Fallback prompt';
```

### Mistake 5: Missing Await on Async Methods

```typescript
// ✗ Wrong - may not complete
langfuse.flush();
langfuse.shutdown();

// ✓ Correct
await langfuse.flush();
await langfuse.shutdown();
```

## Next Steps

- Review [setup.md](./setup.md) for configuration
- Check [README.md](../README.md) for usage examples
- Run examples to verify setup: `npx tsx libs/observability/examples/tracing.ts`
