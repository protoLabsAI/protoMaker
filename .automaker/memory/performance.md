---
tags: [performance]
summary: performance implementation decisions and patterns
relevantTo: [performance]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 0
  successfulFeatures: 0
---
# performance

#### [Pattern] 30-minute maintenance task frequency for stale PR detection (2026-02-11)
- **Problem solved:** Auto-rebase task runs as scheduled maintenance job, not on-demand
- **Why this works:** 30-minute interval balances catching stale PRs quickly vs avoiding excessive git operations and API calls. Matches PR review cycle rhythm (reviewers check every 15-30min). Cron `*/30 * * * *` is readable and widely understood.
- **Trade-offs:** PRs may stay stale for up to 30 minutes. Benefit: predictable resource usage, aligns with human review patterns. Can be tuned per deployment without code changes.

### Attachment processing delegates to existing processAttachment() method rather than creating new attachment handling logic (2026-02-11)
- **Context:** Routed messages may contain attachments (images, files) that agents need to process
- **Why:** Reusing existing processAttachment() (line 860 context) avoids code duplication and ensures attachment handling is consistent across all message types. This method already knows how to validate, upload, and extract attachment metadata.
- **Rejected:** Inline attachment processing - would duplicate logic and create maintenance burden if attachment handling changes
- **Trade-offs:** Simpler code and consistent behavior, but creates implicit dependency on processAttachment() signature. If that method changes, routed messages are affected.
- **Breaking if changed:** If processAttachment() is removed or its signature changes (parameters, return type), routed message attachment processing breaks silently

### Rate limit enforcement happens BEFORE Discord API call, not after. Map lookup + timestamp check cost ~1ms; early exit avoids async Discord call when rate-limited (2026-02-12)
- **Context:** During agent cascades, `notification:created` fires 50+ times per second. Posting all of them to Discord would be wasteful even with Discord's own rate limits
- **Why:** Saves API calls and latency. A failed Discord request (429 or timeout) still wastes the async overhead. Preventing the call entirely is cleaner and gives us deterministic behavior—we know exactly when posts succeed vs are dropped
- **Rejected:** Posting to Discord and letting Discord's rate limiter reject (simple code, but loses observability and wastes bandwidth); debouncing with setTimeout (introduces timing bugs across distributed event emissions)
- **Trade-offs:** Trade code predictability for simplicity—we now have local state (lastNotificationPost Map) that must stay in sync with Discord's actual post rate. If Discord's limits change, we need to adjust NOTIFICATION_RATE_LIMIT_MS. Benefit: no wasted network I/O and guaranteed no 429 errors from Discord
- **Breaking if changed:** If the Map is ever cleared (e.g., service restart), rate limiting resets immediately and a queued burst of notifications posts all at once. If lastNotificationPost Map grows unbounded (new notification types added frequently), memory leak. Mitigation: add a cleanup pass for types not seen in 1 hour

### Used `shell: bash` for all cross-platform script steps instead of platform-specific `sh` or `pwsh` (2026-02-13)
- **Context:** CI workflow must execute consistent logic on ubuntu-latest, macos-latest, and windows-latest
- **Why:** bash is available on all three platforms (Git Bash on Windows). Using platform-native shells (sh on unix, pwsh on windows) requires different syntax per-OS, multiplying maintenance burden.
- **Rejected:** Platform-specific conditionals with different scripts - error-prone; relying on pwsh on Windows - incompatible with ubuntu/macos; using node scripts instead - adds js file overhead
- **Trade-offs:** bash adds ~50MB to Windows runners (via Git Bash) but eliminates script branching logic. Single source of truth outweighs minor disk cost.
- **Breaking if changed:** If bash is removed or unavailable on a runner, all scripts fail. Windows-native shells would require complete script rewrite.