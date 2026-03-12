---
name: testing-strategies
emoji: 🧪
description: Testing patterns and gotchas for the Automaker monorepo. Use when deciding between unit vs integration tests, debugging flaky tests, or writing tests for new services. Trigger on "how to test", "unit vs integration", "test pattern", "flaky test", "write tests", or "testing strategy".
metadata:
  author: agent
  created: 2026-02-12T21:11:11.928Z
  usageCount: 0
  successRate: 0
  tags: [testing, vitest, playwright, patterns, gotchas]
  source: learned
---

# Testing Strategies

## Test Infrastructure

| Type    | Framework  | Command                 | Scope                           |
| ------- | ---------- | ----------------------- | ------------------------------- |
| Unit    | Vitest     | `npm run test:server`   | Server services, utilities      |
| Package | Vitest     | `npm run test:packages` | Shared @protolabsai/\* packages |
| E2E     | Playwright | `npm run test`          | Full browser UI tests           |

## Core Patterns

### .gitignore Pattern Testing

Test .gitignore with actual files + `git check-ignore`, then verify via integration test with `git status`.
**Why:** Pattern syntax errors are silent. Git ignores your files without telling you.

### Event Emission Testing

Verify BOTH presence AND ordering of events — a check for `health:check-completed` existing won't catch missing `health:issue-detected` events.

```typescript
const events: [string, any][] = [];
service.on('*', (type, data) => events.push([type, data]));

// ... trigger action

const issueIdx = events.findIndex((e) => e[0] === 'health:issue-detected');
const completeIdx = events.findIndex((e) => e[0] === 'health:check-completed');
expect(issueIdx).toBeGreaterThanOrEqual(0);
expect(completeIdx).toBeGreaterThan(issueIdx);
```

### Template/Prompt Verification

Check for specific content keywords, not exact strings:

```typescript
expect(template.systemPrompt).toContain('Ava Loveland');
expect(template.systemPrompt).toContain('Chief of Staff');
// NOT: expect(template.systemPrompt).toBe('You are Ava Loveland...')
```

**Why:** Keyword matching survives prompt rewrites. Exact matching breaks on every edit.

## Common Gotchas

### Dev Server Port Conflicts

Playwright E2E tests can't run when dev server is already on ports 3000-3010. Tests spawn their own server. Stop dev server first, or skip E2E and rely on unit + build verification.

### Stale Server Code

After building TypeScript, you MUST restart the dev server. It caches compiled code in memory. Tests run against stale logic otherwise.

### Mocking External Services

Unit tests for GitHub merge, Discord send, etc. mock the service calls. They verify control flow (right args, events emitted), NOT actual API behavior.

```typescript
// Tests verify mergePR is called with right args
expect(githubMergeService.mergePR).toHaveBeenCalledWith({ prNumber: 42 });
// NOT that GitHub actually merged anything
```

### Private Method Testing

`(service as any).privateMethod()` creates illusion of coverage without testing public contracts. If the private method signature changes, tests still pass but public behavior may break.

### File Path Resolution in Monorepo

From `apps/web/tests/` to `libs/types/src/` = `../../../libs/types/src/`. Three levels up to workspace root, not two.

### Circular Dependency Warnings

TypeScript builds succeed despite circular dependency warnings. These don't block compilation but indicate code smell. Don't panic, but don't ignore them long-term.

## When to Use Manual Verification

Use manual verification + documentation instead of automated E2E tests when:

- Feature has complex async state dependencies (settings hydration + project selection + event streams)
- Component rendering depends on non-deterministic timing
- You're iterating rapidly on MVP features

Document the manual steps clearly — they're your acceptance criteria.

## Regex/File-Based Verification

Verification scripts that read source code with regex can confirm structure exists but NOT runtime correctness. They miss:

- Off-by-one in Date.now() comparisons
- Async race conditions
- API response handling errors

For critical paths (notification delivery, data mutations), real tests are worth the investment.
