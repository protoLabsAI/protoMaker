---
name: async-init-patterns
emoji: 🔄
description: Handle race conditions in service initialization. Use when a service crashes or behaves incorrectly because dependent services are not ready yet. Trigger on "race condition", "service not ready", "initialization error", "fires before service is ready", or "async init".
metadata:
  author: agent
  created: 2026-02-12T21:10:38.325Z
  usageCount: 0
  successRate: 0
  tags: [async, initialization, retry, race-condition, patterns]
  source: learned
---

# Async Initialization Patterns

## The Problem: Fire-and-Forget Init Race

A common pattern in the server causes race conditions:

```typescript
// index.ts startup sequence
void discordBotService.initialize(); // fire-and-forget (async)
avaGatewayService.setDiscordBot(discordBotService);
avaGatewayService.initialize(events); // calls postStartupMessage() immediately
```

The `void` keyword discards the promise — initialization runs in background. Any code that depends on the service being ready will fail silently.

**Observed:** `AvaGatewayService.postStartupMessage()` called `discordBotService.sendToChannel()` before the Discord client finished `client.login()`. The bot couldn't fetch channels → returned `false` → startup message never posted.

## Fix: Retry with Bounded Attempts

```typescript
private async postStartupMessage(): Promise<void> {
  if (!this.infraChannelId || !this.discordBotService) return;

  const maxRetries = 3;
  const retryDelayMs = 3000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const success = await this.discordBotService.sendToChannel(
        this.infraChannelId, message
      );
      if (success) {
        logger.info('Posted startup message to Discord');
        return;
      }
      if (attempt < maxRetries) {
        logger.debug(`Service not ready, retrying (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      } else {
        logger.error('Failed after retries', error);
      }
    }
  }
  logger.warn('Could not complete operation — dependent service may not be connected');
}
```

## Key Principles

1. **Bounded retries** — Always set `maxRetries`. Unbounded retries = potential infinite loop.
2. **Fixed delay, not exponential** — For startup sequencing, 2-5s fixed delay is fine. Exponential backoff is for external APIs.
3. **Graceful degradation** — If all retries fail, `warn` (not `error`) and continue. The service starting shouldn't be blocked by optional features.
4. **Check return value** — `sendToChannel()` returns `false` when not ready. Don't just catch exceptions — check success indicators.

## When to Use This Pattern

- Any service method called during startup that depends on async initialization
- Features that call external services (Discord, Linear, GitHub) during init
- Notification/message posting that's nice-to-have but not critical

## When NOT to Use

- Critical path initialization (use `await` instead of `void`)
- If the dependent service has an `isReady()` check — poll that instead
- If you can restructure to use event-driven init (`service.on('ready', callback)`)

## Related: setInterval + Async Shutdown

Another async pattern gotcha: If a service uses `setInterval` for periodic work, `stop()` during an in-flight async operation won't exit cleanly.

**Fix:** Check an abort flag at the entry of each tick AND before heavy async operations:

```typescript
private async tick(): Promise<void> {
  if (this.aborted) return;  // Check at entry
  const data = await this.fetchData();
  if (this.aborted) return;  // Check before heavy work
  await this.processData(data);
}
```
