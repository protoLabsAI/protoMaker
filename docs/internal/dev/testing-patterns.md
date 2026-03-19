# Testing Patterns

Patterns and anti-patterns for writing tests in the protoLabs codebase.

## Event-Driven Testing

### Verify both presence AND ordering of events

A check for `health:check-completed` existing will pass even if `health:issue-detected` was never emitted. Event-driven systems are easy to test incompletely.

```typescript
// Bad: only checks endpoint event
expect(events).toContainEqual({ type: 'health:check-completed' });

// Good: verify the full event sequence
const issueIndex = events.findIndex((e) => e.type === 'health:issue-detected');
const completeIndex = events.findIndex((e) => e.type === 'health:check-completed');
expect(issueIndex).toBeLessThan(completeIndex);
```

### Use event spy callbacks for sequence verification

Capture the full event stream with a callback spy, then filter by event type and compare indices.

```typescript
const events: Array<[string, unknown]> = [];
emitter.on('*', (type, data) => events.push([type, data]));

// After operation...
const issueEvents = events.filter(([type]) => type === 'health:issue-detected');
const completeEvents = events.filter(([type]) => type === 'health:check-completed');
expect(issueEvents.length).toBeGreaterThan(0);
```

## Template & Prompt Testing

### Use keyword assertions, not exact string matching

Check for identifiers like `'AVA'`, `'GTM'`, `'protoLabs'` rather than full prompt text. Keyword-based assertions are robust to prompt refinements.

```typescript
// Bad: brittle, breaks on any wording change
expect(template.systemPrompt).toBe('You are AVA, your Autonomous Virtual Agency...');

// Good: documents what matters about the prompt
expect(template.systemPrompt).toContain('AVA');
expect(template.systemPrompt).toContain('Autonomous Virtual Agency');
```

## .gitignore Testing

### Validate .gitignore with actual git commands

Pattern syntax errors in `.gitignore` are silent. Validate in two layers:

1. **Syntax correctness:** `git check-ignore` against test files
2. **Intent correctness:** `git status` to verify the file appears/doesn't appear

```bash
# Verify a file IS ignored
git check-ignore path/to/file  # should output the path

# Verify a file is NOT ignored (whitelist works)
git check-ignore path/to/file  # should output nothing
git status --short  # file should appear as untracked
```

## Anti-Patterns

### Don't test private methods directly

`(service as any).privateMethod()` bypasses TypeScript visibility but doesn't test real behavior. Test through the public API instead.

### Don't use file-reading tests as a substitute for runtime tests

`fs.readFileSync()` to verify interface definitions catches syntax errors but misses logic errors. Use actual component rendering or service instantiation when possible.

### Don't rely on verification scripts for runtime correctness

Regex-based verification of source code catches structural issues (95% accurate) but misses off-by-one errors, async race conditions, and API failures. Reserve for quick feedback loops, not final verification.

### Don't assume test helpers work for mutation scenarios

Helpers designed for single-use setup (`createFeatures(path, count)`) may overwrite data when called multiple times. Inline manual creation when test flow requires incremental mutations.

## Visual Testing with agent-browser

### When to use

The frontend agent has exclusive access to `agent-browser`, a headless browser CLI built for AI agents. Use it for visual verification during frontend work — not as a replacement for Playwright E2E tests.

| Use case                                      | Tool          |
| --------------------------------------------- | ------------- |
| Verify component renders after implementation | agent-browser |
| Theme/token change validation across views    | agent-browser |
| Responsive layout spot-checks                 | agent-browser |
| Critical user flow testing                    | Playwright    |
| CI regression gates                           | Playwright    |

### Snapshot-ref workflow

agent-browser uses accessibility tree snapshots with deterministic refs (`@e1`, `@e2`) instead of CSS selectors. Always re-snapshot after navigation or state changes — refs are only valid for the current page state.

```bash
# Take snapshot, interact, verify
agent-browser open http://localhost:3007/dashboard
agent-browser snapshot -i --json        # Get interactive element refs
agent-browser click @e5                  # Click by ref
agent-browser wait --load networkidle    # Wait for state change
agent-browser snapshot -i --json        # Re-snapshot (refs may change)
agent-browser screenshot result.png      # Visual proof
agent-browser close                      # Free resources
```

### Rules

- Dev server must be running on `localhost:3007` before using agent-browser
- Always close the browser session when done (`agent-browser close`)
- Don't commit screenshots — use them for verification only, then clean up
- Use `--json` flag when parsing snapshot output programmatically

## Integration Testing

### Mock boundaries, not internals

Unit tests for merge functionality should mock `githubMergeService.mergePR()`, not the internal GitHub API calls. This verifies control flow (correct args, events emitted) without requiring real credentials.

### Handle optional dependencies with null

```typescript
// Service with optional GitHub checker
const monitor = new WorldStateMonitor(null as any);
// Disables GitHub checks, allows testing drift detection in isolation
```

### Write-time computed fields enable efficient query testing

Compute derived fields (like `prReviewDurationMs`) at write time rather than query time. This enables efficient filtering/sorting in tests without post-processing arithmetic.
