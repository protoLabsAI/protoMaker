# QA Engineer (Quinn)

Reference documentation for the Quinn QA engineer role in protoLabs Studio. This page covers the tools, playbooks, report format, and release pipeline integration. Intended for operators running QA passes and contributors extending the QA system.

## Overview

Quinn is the AI QA engineer for protoLabs Studio. Activated via `/quinn` in Claude Code. Quinn validates releases, tests API endpoints, verifies service wiring, and generates structured pass/fail reports. The role combines static code verification with runtime API testing and visual UI checks to catch issues that slip through CI.

## Tools

Quinn has access to five categories of tooling, each covering a distinct verification layer.

### API Testing (curl via Bash)

Direct HTTP calls to the running server. All requests use the `X-API-Key` header for authentication.

```bash
curl -s -H "X-API-Key: $AUTOMAKER_API_KEY" \
  http://localhost:3008/api/health | jq .
```

Validates response status codes, JSON structure, and field values. Useful for contract testing new or changed endpoints.

### Code Verification (Grep/Glob/Read)

Static analysis of the codebase to verify wiring and exports without running the server.

| Check              | What to look for                                                     |
| ------------------ | -------------------------------------------------------------------- |
| Service wiring     | New services registered in `wiring.ts` and `services.ts`             |
| Type exports       | New types exported from `index.ts` barrel files in `libs/types/src/` |
| Route registration | New routes added to the correct router in `apps/server/src/routes/`  |
| UI components      | Component file exists, hook is wired, API client method is defined   |

### Browser Automation (agent-browser)

Visual UI verification via a headless Chromium instance controlled through MCP tools.

```
browser_navigate → browser_snapshot → browser_click → browser_screenshot
```

agent-browser uses an accessibility tree with semantic element references (`@e1`, `@e2`) instead of CSS selectors. Refs are valid only for the current page state. Always re-snapshot after navigation or interaction.

### Aggregation (run_qa_check MCP tool)

Single-call QA health snapshot that consolidates multiple verification sources.

```typescript
mcp__protolabs__run_qa_check({
  projectPath: '/home/josh/dev/ava',
});
```

Returns a combined view of: health status, registered timers, recent deployments, DORA metrics, board state, and signal processing status.

### Build Verification

Standard monorepo build checks that catch type errors and test failures.

```bash
npm run typecheck        # Full monorepo type safety (UI + server)
npm run test:server      # Server unit tests (Vitest)
npm run test:packages    # Shared package tests
```

These run in CI automatically but Quinn re-runs them locally when verifying a release candidate or investigating a regression.

## Playbooks

### Release QA

Full verification suite for a staging or production release. Run after every `dev -> staging` or `staging -> main` promotion.

1. **Scope** -- Identify what changed since the last release using `git log`.
2. **Type safety** -- Run `npm run typecheck` to catch broken types across the monorepo.
3. **Wiring check** -- Grep for new services in `wiring.ts`, verify they are instantiated and registered.
4. **API contract testing** -- Hit each new or changed endpoint with curl, verify response shape.
5. **UI component check** -- Confirm new component files exist, hooks are wired, client methods are defined.
6. **CI hook check** -- Review workflow file changes in `.github/workflows/` for correctness.
7. **Timer/scheduler check** -- Verify new timers appear in `GET /api/ops/timers` response.
8. **Visual QA** -- Use agent-browser to load key UI views and verify rendering.
9. **Report generation** -- Produce a structured pass/fail report (see Report Format below).

### Endpoint QA

Focused verification of a specific endpoint or feature area. Useful when a single service changes without a full release.

1. Read the route handler and service implementation.
2. Verify the endpoint is registered in the correct router.
3. Test with curl: valid input, missing params, malformed body, unauthorized request.
4. Check that events are emitted correctly (verify via WebSocket or event log).
5. Report findings in the standard format.

### Regression QA

Checking for breakage after a large change (refactor, dependency upgrade, package restructure).

1. Run the full test suite: `npm run test:all`.
2. Run typecheck: `npm run typecheck`.
3. Identify the blast radius of the change using `git diff --stat`.
4. Manually test any endpoints or UI views in the blast radius.
5. Check for unwired code: every new file must have a non-test importer.

### Visual QA

Browser-based UI verification using agent-browser MCP tools. Requires the dev server running on `localhost:3007`.

1. Navigate to the target view with `browser_navigate`.
2. Capture the accessibility tree with `browser_snapshot`.
3. Interact with elements using `browser_click` and `browser_fill`.
4. Wait for state changes with `browser_wait`.
5. Capture screenshots with `browser_screenshot` for visual evidence.
6. Verify element presence and text content from the accessibility tree.

## Report Format

Quinn generates a markdown table summarizing each check with a pass/fail status.

```markdown
## QA Report — v0.52.0 Release

| #   | Check                               | Status | Notes                                   |
| --- | ----------------------------------- | ------ | --------------------------------------- |
| 1   | Typecheck                           | PASS   | Clean across all packages               |
| 2   | Server unit tests                   | PASS   | 247 tests, 0 failures                   |
| 3   | Service wiring (DoraMetricsService) | PASS   | Registered in wiring.ts L142            |
| 4   | GET /api/metrics/dora               | PASS   | Returns valid DORA snapshot             |
| 5   | POST /api/features/list             | PASS   | 200, correct schema                     |
| 6   | UI Ops Dashboard render             | PASS   | All tabs visible, timer table populated |
| 7   | Timer registration (board-janitor)  | FAIL   | Missing from /api/ops/timers            |

---

**Verdict: CONDITIONAL PASS**

6/7 checks passed. Timer registration issue is non-blocking (cosmetic).
Recommend merging with a follow-up fix for the timer registration.
```

The verdict is one of:

| Verdict          | Meaning                                                         |
| ---------------- | --------------------------------------------------------------- |
| PASS             | All checks passed. Safe to promote.                             |
| CONDITIONAL PASS | Minor issues found. Safe to promote with follow-up fixes noted. |
| FAIL             | Blocking issues found. Do not promote until resolved.           |

## agent-browser Setup

### Install

```bash
npm install -g agent-browser
agent-browser install
```

### Register MCP server (project-level)

```bash
claude mcp add agent-browser -- npx agent-browser-mcp
```

This registers agent-browser as an MCP server, exposing 40+ browser control tools to Claude Code.

### How it works

agent-browser is a Rust CLI that controls Chrome for Testing via the Chrome DevTools Protocol (CDP). The MCP wrapper exposes browser actions as tool calls.

| Property          | Detail                                                           |
| ----------------- | ---------------------------------------------------------------- |
| Element selection | Semantic refs from accessibility tree (`@e1`, `@e2`)             |
| Token efficiency  | 5.7x better than Playwright MCP (smaller snapshots)              |
| Rendering         | Full Chromium -- accurate for CSS, animations, responsive layout |
| Screenshot format | PNG, configurable viewport size                                  |

### Key commands

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `browser_navigate`   | Open a URL in the browser                       |
| `browser_snapshot`   | Get the accessibility tree for the current page |
| `browser_click`      | Click an element by semantic ref (`@e1`)        |
| `browser_fill`       | Type text into an input field                   |
| `browser_screenshot` | Capture a PNG screenshot                        |
| `browser_wait`       | Wait for an element or network idle             |
| `browser_evaluate`   | Run arbitrary JavaScript in the page context    |

### Rules

- The dev server must be running on `localhost:3007` before using agent-browser.
- Always re-snapshot after navigation or state changes. Refs are invalidated by DOM mutations.
- Do not commit screenshots. Use them for verification only, then clean up.
- For Electron testing, connect via CDP: `agent-browser --cdp 9222 open http://localhost:3007`.

## Integration with Release Pipeline

Quinn runs after each promotion to staging or production. The verification sequence:

1. **Post-deploy health check** -- `GET /api/health` returns 200 with all subsystems healthy.
2. **API endpoint regression** -- Hit critical endpoints (features, board, settings, metrics) and verify response schemas.
3. **UI smoke test** -- Load the board, settings, and ops dashboard views via agent-browser. Verify rendering and interactive elements.
4. **Signal/timer registration** -- Verify all expected timers appear in `GET /api/ops/timers`. Check signal processing via `GET /api/ops/signals`.
5. **Report** -- Generate the QA report and post findings to the `#dev` Discord channel.

### Staging vs Production

| Stage      | Scope                              | Blocking                             |
| ---------- | ---------------------------------- | ------------------------------------ |
| Staging    | Full playbook (all 9 steps)        | Yes -- FAIL blocks promotion to main |
| Production | Health + API regression + UI smoke | Yes -- FAIL triggers rollback        |

## API Reference

### run_qa_check (MCP tool)

Aggregation endpoint that returns a consolidated QA snapshot for a project.

```typescript
// MCP call
mcp__protolabs__run_qa_check({
  projectPath: '/home/josh/dev/ava',
});
```

**Parameters:**

| Param         | Type   | Required | Description                       |
| ------------- | ------ | -------- | --------------------------------- |
| `projectPath` | string | Yes      | Absolute path to the project root |

**Response fields:**

| Field         | Description                                                         |
| ------------- | ------------------------------------------------------------------- |
| `health`      | Server health check result (subsystem statuses)                     |
| `timers`      | All registered scheduler timers with status and last-run times      |
| `deployments` | Recent deployment events with timestamps and versions               |
| `dora`        | Current DORA metrics snapshot (frequency, lead time, CFR, recovery) |
| `board`       | Board summary (feature counts by status)                            |
| `signals`     | Signal processing status and recent intake events                   |

## Future Work

- **Automated visual regression** -- Screenshot comparison against baseline images to detect unintended UI changes.
- **E2E test orchestration** -- Use agent-browser to drive full Playwright-style user flows without Playwright's overhead.
- **Coverage tracking** -- Integrate with Vitest coverage reports to flag untested code paths in changed files.
- **Plugin distribution** -- Package Quinn as a reusable Claude Code skill for end users running their own QA passes.
