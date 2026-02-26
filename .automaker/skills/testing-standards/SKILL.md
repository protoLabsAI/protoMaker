---
name: testing-standards
description: Vitest patterns, test isolation principles, and avoid hardcoded count assertions
triggers: [test, vitest, unit, integration, spec, jest, assertion]
---

# Testing Standards

## Vitest Patterns

Server unit tests use Vitest. Run them with:

```bash
npm run test:server                                      # All server tests
npm run test:server -- tests/unit/specific.test.ts      # Single file
npm run test:packages                                    # All package tests
```

## Test Isolation

Each test should set up and tear down its own state. Do not rely on test execution order:

```typescript
import { beforeEach, afterEach, describe, it, expect } from 'vitest';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  afterEach(() => {
    service.cleanup();
  });

  it('does the thing', () => {
    expect(service.doThing()).toBe(true);
  });
});
```

## No Hardcoded Counts

Avoid assertions that depend on exact list counts that may change over time:

```typescript
// ❌ Brittle — breaks when new items are added
expect(results).toHaveLength(5);

// ✅ Better — check behavior, not count
expect(results.length).toBeGreaterThan(0);
expect(results.find((r) => r.name === 'expected')).toBeDefined();
```

## Mocking

Use `vi.mock()` for external dependencies. Mock at the module level, not inside tests:

```typescript
import { vi } from 'vitest';

vi.mock('@protolabs-ai/git-utils', () => ({
  getGitRepositoryDiffs: vi.fn().mockResolvedValue([]),
}));
```

## Environment Variables

Use `process.env` assignments inside `beforeEach`/`afterEach` for env var tests, and always restore:

```typescript
const originalKey = process.env.MY_KEY;
beforeEach(() => {
  process.env.MY_KEY = 'test-value';
});
afterEach(() => {
  process.env.MY_KEY = originalKey;
});
```
