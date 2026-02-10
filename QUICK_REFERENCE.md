# Quick Reference: Configurable MAX_SYSTEM_CONCURRENCY

## TL;DR

Set `AUTOMAKER_MAX_CONCURRENCY` environment variable to override the default max concurrent agents.

```bash
# Default (2 agents max)
npm run dev:web

# Staging (8 agents max)
export AUTOMAKER_MAX_CONCURRENCY=8
npm run dev:web

# Low resource (1 agent max)
export AUTOMAKER_MAX_CONCURRENCY=1
npm run dev:web
```

## Constraints

- Minimum: 1
- Maximum: 20
- Default: 2

## Files to Know

- **Core**: `libs/types/src/settings.ts` - `getMaxSystemConcurrency()` function
- **Startup Logging**: `apps/server/src/index.ts` - Shows effective max on startup
- **Enforcement**: `apps/server/src/services/auto-mode-service.ts` - Respects the limit

## Server Output Examples

```
# Without env var (default)
[SERVER_STARTUP] MAX_SYSTEM_CONCURRENCY: 2 (default)

# With env var
[SERVER_STARTUP] MAX_SYSTEM_CONCURRENCY: 8 (from AUTOMAKER_MAX_CONCURRENCY=8)

# Invalid values
[AUTOMAKER_MAX_CONCURRENCY] Value 50 exceeds maximum of 20. Using maximum of 20.
[SERVER_STARTUP] MAX_SYSTEM_CONCURRENCY: 20
```

## Environment-Specific Configuration

### Development
```bash
# No env var needed, defaults to 2
npm run dev:web
```

### Staging (125GB RAM, 24 CPUs)
```bash
# In docker-compose.yml or systemd service
environment:
  - AUTOMAKER_MAX_CONCURRENCY=8
```

### Production
```bash
# Adjust based on resource availability
# For 16 CPUs: AUTOMAKER_MAX_CONCURRENCY=6
# For 8 CPUs: AUTOMAKER_MAX_CONCURRENCY=4
export AUTOMAKER_MAX_CONCURRENCY=6
npm run dev:web
```

## Testing

Run unit tests:
```bash
npm run test:packages -- libs/types/tests/max-concurrency.test.ts
```

Expected: All 10 tests pass

## How It Works

1. Server starts and loads `@automaker/types`
2. `MAX_SYSTEM_CONCURRENCY` is computed from `getMaxSystemConcurrency()`
3. `getMaxSystemConcurrency()` reads `AUTOMAKER_MAX_CONCURRENCY` env var
4. Value is validated (min 1, max 20) with warnings logged
5. Effective value is logged at startup
6. Auto-mode service enforces the limit in `resolveEffectiveMaxConcurrency()`

## Troubleshooting

### My env var isn't being read
```bash
# Make sure to set it BEFORE starting the server
export AUTOMAKER_MAX_CONCURRENCY=8
npm run dev:web

# Not like this (won't work):
npm run dev:web &
export AUTOMAKER_MAX_CONCURRENCY=8
```

### The limit isn't being enforced
Check the startup logs:
```bash
npm run dev:web 2>&1 | grep MAX_SYSTEM_CONCURRENCY
```

Should show:
```
[SERVER_STARTUP] MAX_SYSTEM_CONCURRENCY: 8 (from AUTOMAKER_MAX_CONCURRENCY=8)
```

### My value was rejected
Check the logs for the warning message:
```bash
[AUTOMAKER_MAX_CONCURRENCY] Value 50 exceeds maximum of 20. Using maximum of 20.
```

Valid range is 1-20. Set a value in that range.
