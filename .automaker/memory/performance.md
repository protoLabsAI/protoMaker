---
tags: [performance]
summary: performance implementation decisions and patterns
relevantTo: [performance]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 36
  referenced: 13
  successfulFeatures: 13
---
<!-- domain: Performance Optimization | Rendering, caching, latency reduction patterns -->

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

#### [Pattern] LRU eviction strategy with configurable max cache size to prevent unbounded memory growth (2026-02-13)
- **Problem solved:** Prompt cache could theoretically grow indefinitely if many unique prompts are accessed
- **Why this works:** LRU naturally evicts least-recently-used items when cache is full, preserving working set of active prompts while bounding memory. Configurable size allows tuning per deployment needs.
- **Trade-offs:** Requires tracking access order (minimal overhead) but prevents memory issues in production. Trade cache hit rate for reliability.

### Prompt reduction from 263 to 100 lines improves token efficiency without sacrificing coverage (2026-02-14)
- **Context:** Switching to XML format allowed aggressive simplification of fact-checker.md template
- **Why:** Less verbose prompt reduces token cost per LLM call (~60% reduction). XML structure forces clarity - rambling explanations compressed to required fields only.
- **Rejected:** Keeping verbose markdown format - higher token cost accumulates across thousands of fact-checks. Detailed instructions don't improve output quality if structure is clear.
- **Trade-offs:** Simpler prompt reduces cost but requires clearer field definitions. More constraints but better predictability.
- **Breaking if changed:** If prompts get expanded back to verbose format without monitoring, token costs could increase 2-3x across production fact-checking workloads

### 30-second timeout for Linear API requests with AbortController, leveraging native fetch cancellation (2026-02-14)
- **Context:** The fetchIssueRelations method makes network requests to Linear's GraphQL API which could hang.
- **Why:** Prevents webhook handlers from blocking indefinitely on slow/unavailable Linear API. 30s is reasonable for a GraphQL query. AbortController is the standard mechanism and integrates cleanly with catch logic.
- **Rejected:** No timeout would risk blocking webhook handlers. Promise.race with setTimeout would require manual cleanup.
- **Trade-offs:** Easier: Native API, clean error handling. Harder: Must manually clear timeout in success path (existing code does this).
- **Breaking if changed:** If timeout is removed, slow Linear API responses could block webhook processing for other issues.

### Lazy-load TipTap editor via React.lazy() with Suspense boundary to defer ~200KB bundle until modal is opened (2026-02-15)
- **Context:** TipTap is a large library (~200KB) that's only needed when user opens PRDEditorModal. Including it in main bundle would impact initial page load for all users.
- **Why:** Monorepo UI has many features competing for bundle space. Code-splitting HITL approval flow avoids shipping unused TipTap code to users who never trigger interrupts. The modal is opened on-demand during HITL approval, making lazy loading the optimal trade-off.
- **Rejected:** Direct import of TipTap at top-level: simpler code but forces all users to download 200KB unused in happy path. Dynamic import without Suspense: requires manual loading state management.
- **Trade-offs:** Lazy loading adds slight UX delay (~500ms-1s) when modal first opens while TipTap bundle loads, but saves 200KB on initial pageload for 95%+ of users. Suspense boundary provides fallback UI (spinner) during load.
- **Breaking if changed:** Removing lazy loading restores immediate modal rendering but bloats main bundle by 200KB. Removing Suspense boundary causes render error if chunk fails to load. Moving TipTap import to top level defeats lazy load benefit and increases initial JS payload.

#### [Pattern] Activity feed implemented as client-side ring buffer (last 10 events stored in component state) rather than server-side pagination or unbounded accumulation (2026-02-17)
- **Problem solved:** Overlay needs to display recent system events in real-time, updated via WebSocket, but memory must not grow unbounded if overlay runs 24/7 during streams
- **Why this works:** Ring buffer prevents memory leaks on long-running streams by keeping fixed-size array. Client-side implementation avoids extra API calls and reduces server load. 10-event buffer is sufficient for visual context without cluttering the overlay
- **Trade-offs:** Lost events older than 10 are not retrievable — acceptable for a real-time activity display where historical context is not needed. Ring buffer adds minor complexity vs simple array.push()

### Applied motion/framer-motion animations to panel entrance/exit instead of instant rendering (2026-02-18)
- **Context:** Panel toggles with PipelineToolbar buttons need visual feedback
- **Why:** Smooth animations reduce jarring UX, clarify what changed on screen, match modern app conventions established by flow-graph panels
- **Rejected:** Instant toggle without animation - feels broken/unpolished, hard to follow in interface
- **Trade-offs:** Slight performance cost on older devices, but improved perceived performance. Animation adds 16-24 line motion component wrapper.
- **Breaking if changed:** If motion/react library is removed or browser doesn't support animations, panels appear/disappear instantly without visual feedback.

#### [Pattern] Named ESM exports preserve tree-shaking across multi-entry monorepo builds (2026-02-18)
- **Problem solved:** Exporting a utility function (cn) from a shared package that must remain tree-shakeable when imported by multiple apps
- **Why this works:** The built dist/lib/index.js uses named exports (`export { cn }`) rather than default or wrapped exports. This allows bundlers (webpack, vite, esbuild) to statically analyze which exports are actually used and remove unused code.
- **Trade-offs:** Named exports require explicit import syntax from consumers (`import { cn } from '@protolabsai/ui/lib'`), but this is explicitly desired for clarity. Unused utilities in lib/ are automatically dropped during consumer build.

#### [Gotcha] Large story files (12+ export statements) can impact Storybook build time but tradeoff is worth it for comprehensive component coverage in single file vs split files (2026-02-18)
- **Situation:** Some atoms (textarea, skeleton, spinner, label, kbd) have 11-12 story exports. Textarea has 12 stories in single file
- **Root cause:** Keeping variant stories together makes it obvious all variants exist and interact together. Splitting across files spreads them through filesystem making coverage less obvious. Single file per component matches the component file organization principle
- **How to avoid:** Larger file size (few KB each) with better coherence vs smaller files scattered across directory. Storybook loads all stories anyway so no real performance impact

#### [Pattern] Use React Query with refetchOnWindowFocus: false for one-time hydration data (2026-02-19)
- **Problem solved:** Pipeline state hydration should happen once on mount, then rely on WebSocket for real-time updates
- **Why this works:** Prevents unnecessary re-fetches when user returns to window after switching tabs. Caching + WebSocket pattern is more efficient than polling. Setting refetchOnWindowFocus to false explicitly signals this is hydration, not live data
- **Trade-offs:** Gains: Automatic caching, deduplication if hook called multiple times. Loses: Doesn't automatically refetch if user manually refreshes data (but WebSocket updates are faster anyway)

#### [Pattern] Tools accumulated in pendingTools Map during stream processing, then processed in single batch after assistant turn completes. Pending tools cleared after processing. (2026-02-23)
- **Problem solved:** A single agent turn may execute 5-10 tools. Without batching, each tool would trigger a feature.json write, causing 5-10 sequential disk I/O operations.
- **Why this works:** Reduces I/O from O(N) to O(1). Single atomic write means tool executions appear atomically in feature.json. Clearing pendingTools prevents memory leaks from orphaned operations if agent turn is interrupted.
- **Trade-offs:** More complex state management (pendingTools tracking). But massive I/O reduction and memory safety.

### Per-featureId debounce isolation: Each agent node has independent 500ms debounce timer via Map<featureId, timeoutId> rather than single global debounce (2026-02-23)
- **Context:** Multiple agent nodes executing tools simultaneously would interfere with each other's update timings under global debounce
- **Why:** Prevents one active agent from delaying UI updates to another agent. Global debounce would serialize all updates to 500ms intervals, causing visible lag when 2+ agents run concurrently
- **Rejected:** Single global debounce timer would be simpler but couples independent agent states
- **Trade-offs:** More complex state management (Map) but eliminates cross-agent scheduling interference. Each agent now updates within 500ms independently
- **Breaking if changed:** If changed to global debounce, rapid tool events from multiple agents would queue serially, causing 1-2s delays on the slower agent

#### [Gotcha] 500ms debounce window is empirically chosen and could accumulate latency in high-frequency scenarios (10+ tool events/sec). No adaptive adjustment (2026-02-23)
- **Situation:** Rapid tool execution from parallel agent work can generate bursts of 20-50 events within 2 seconds
- **Root cause:** 500ms balances responsiveness (not >1s lag) with batching efficiency (reduces render cycles). Chosen without profiling actual event frequencies
- **How to avoid:** Fixed 500ms is predictable but not optimal for all workloads. High-frequency scenarios see visible batch delays. Low-frequency scenarios respond instantly

#### [Pattern] Simple timestamp-based TTL cache with 30-second window for expensive aggregation queries. No event-based invalidation, no external cache store. (2026-02-23)
- **Problem solved:** getAgentPerformance loads and computes statistics across all completed features - expensive operation that could be called repeatedly by UI dashboards.
- **Why this works:** Analytics data changes slowly in practice (features complete infrequently). 30s staleness is acceptable for non-transactional analytics. Timestamp-based TTL is simple - no distributed cache coordination, no event bus coupling.
- **Trade-offs:** Accept up to 30s stale data to avoid invalidation complexity. Feature completion at T=0 queried at T=29 gets pre-completion stats. Works for analytics (not time-critical), not for transactional data.

### 30-second polling interval via refetchInterval: 30000 for ceremony status (2026-02-24)
- **Context:** Needed to surface Discord integration failures and ceremony counts in real-time UI
- **Why:** 30s balances observability (status updates frequently enough to catch issues) with API load (not excessive requests). Avoids complexity/cost of WebSockets or Server-Sent Events
- **Rejected:** Real-time via WebSockets (infrastructure complexity), 5s polling (API load), on-demand queries (stale data)
- **Trade-offs:** UI may be up to 30s behind reality; 30s polling is acceptable for non-critical status display vs maintenance burden of real-time infrastructure
- **Breaking if changed:** Changing interval affects data freshness guarantees and API load; shorter intervals increase requests exponentially across all users

### Extended React Query gcTime from 5 minutes to 24 hours (24*60*60*1000ms) (2026-02-24)
- **Context:** PWA feature requires cached data to persist across browser restart/refresh so board displays instantly from cache before server responds
- **Why:** gcTime controls how long stale data is kept in memory before garbage collection. 24 hours allows data to survive page refresh and browser restart within same day. Longer retention trades memory for UX (instant data display).
- **Rejected:** Shorter gcTime (5-30 min) would require fresh server fetch on each page load or browser restart, defeating offline-first PWA pattern. Session/sessionStorage would lose data on browser restart entirely.
- **Trade-offs:** Memory usage increases (more cached queries held longer), but eliminates network spinner on page refresh IF data is already cached. Cache is still soft (can be invalidated/refetched), not stale (user still sees fresh indicator).
- **Breaking if changed:** If gcTime is reverted to <1 hour, cached data won't persist across browser restart, eliminating the instant-load UX that PWA feature enables

#### [Pattern] Achieved sub-12KB PNG files (10x better than 300KB requirement) by leveraging PNG palette mode compression on simple branded graphics with limited color palette (2026-02-24)
- **Problem solved:** Generating simple branded images with dark background, logo, text, and gradient accents
- **Why this works:** Simple graphics with large solid color areas compress extremely well in palette mode. Going beyond minimum requirements demonstrates mobile-first thinking and quality standards without extra effort
- **Trade-offs:** No quality loss because simple graphics lack photos/gradients that suffer from aggressive compression

### Disabled Gatekeeper assessment during build (gatekeeperAssess: false) as performance optimization (2026-02-24)
- **Context:** Gatekeeper assessment runs as part of code signing process, but notarization performs more comprehensive security checks afterward
- **Why:** Gatekeeper's assessment is redundant when notarization follows - notarization is a superset check that includes Gatekeeper validation. Skipping during build saves time without reducing security posture
- **Rejected:** Keeping assessment enabled adds build time without benefit since final notarization is more thorough
- **Trade-offs:** Saves 1-5 minutes per build by deferring security check to notarization (which already validates everything)
- **Breaking if changed:** If re-enabled, builds take slightly longer but gain extra validation layer during signing (not breaking, just slower)

#### [Gotcha] Notarization adds 1-5 minute latency per macOS build due to network round-trip to Apple's services, creating observable build time increase in CI/CD (2026-02-24)
- **Situation:** Automated code signing and notarization requires external service call during every build
- **Root cause:** This is a gotcha because while notarization is necessary for macOS distribution, the performance impact is non-obvious upfront and accumulates across all builds. It's an acceptable tradeoff but requires understanding the cost
- **How to avoid:** 1-5 minute build time cost vs mandatory security/functionality requirement on macOS - the cost is inherent to the platform requirement

#### [Gotcha] Rate limiting set to 6000ms (10 calls/minute) creates sequential processing bottleneck. With conservative timing, large knowledge bases will take hours/days to process all chunks. (2026-02-24)
- **Situation:** HyPE worker uses setTimeout-based rate limiting between Haiku API calls to avoid quota issues
- **Root cause:** Safety-first approach prioritizes quota safety over throughput, but Haiku has much higher quotas than GPT-4. The conservative rate was chosen to prevent any risk of quota exhaustion.
- **How to avoid:** Safety and simplicity gained (single setTimeout loop), but throughput severely limited. Large datasets become a multi-hour background job.

### Embedding averaging uses simple element-wise sum/divide instead of weighted averaging or L2 normalization. Creates representative query vector by averaging hypothetical question embeddings. (2026-02-24)
- **Context:** Multiple generated questions need to be combined into single embedding for similarity search against chunk embeddings
- **Why:** Element-wise averaging is mathematically simple, works for cosine similarity (magnitude-invariant), and reduces embedding count. Alternative methods add computational overhead without clear benefit for retrieval.
- **Rejected:** L2 normalization adds complexity; weighted averaging requires deciding weights; PCA-based reduction requires matrix computation
- **Trade-offs:** Simplicity and speed gained, but loses vector magnitude information which is irrelevant for cosine similarity anyway
- **Breaking if changed:** If changed to L2-normalized averaging, magnitude-dependent similarity metrics would be affected

### Evaluation logging uses async void promise (non-blocking) to prevent search request latency impact (2026-02-24)
- **Context:** Adding evaluation logging for offline analysis without degrading search response times
- **Why:** Search latency is user-facing; evaluation logging is for backend analytics. Async prevents blocking request completion on I/O
- **Rejected:** Synchronous logging would guarantee data persistence but increase search p95/p99 latency
- **Trade-offs:** Faster search responses gain risk of data loss on ungraceful shutdown; no backpressure if logging falls behind
- **Breaking if changed:** Making logging synchronous would add measurable latency to every search; removing evaluation logging removes production data needed to optimize algorithm weights

### Conservative rate limiting at 6000ms/call (10 calls/minute) for Haiku API instead of more aggressive batching (2026-02-24)
- **Context:** Generating 3 queries per chunk via Claude Haiku requires API calls that must be rate-limited
- **Why:** Prioritizes API quota safety and avoiding throttling over faster processing speed. System maintains reliability even under high ingestion loads
- **Rejected:** Batching multiple chunks per API call or reducing delay (would risk hitting rate limits or quota exhaustion)
- **Trade-offs:** HyPE generation slower (10 chunks/min max) but never risks API failures; client sees stale HyPE status temporarily during bulk ingestion
- **Breaking if changed:** Reducing delay below 6000ms risks quota errors; removing rate limiting entirely could cause cascading API failures on large knowledge bases

### Use simple element-wise average of query embeddings (sum then divide by count) instead of weighted average or L2 normalization (2026-02-24)
- **Context:** Each chunk's 3 questions generate 3 embeddings that must be combined into single vector for semantic search
- **Why:** No information about relative importance of the 3 questions; simple average is mathematically unbiased. Normalization adds complexity without clear benefit for semantic averaging
- **Rejected:** Weighted average (would require scoring questions by relevance); L2 normalization (adds computation, unclear if beneficial for aggregated embeddings)
- **Trade-offs:** Fast computation and deterministic results vs potential loss of query distinctiveness (questions blend into middle-ground embedding)
- **Breaking if changed:** Changing averaging algorithm invalidates all stored hype_embeddings; stored vectors are no longer comparable to newly generated ones

### Async, fire-and-forget evaluation logging (void promise) rather than synchronous logging (2026-02-24)
- **Context:** Capturing search evaluation metrics without introducing latency overhead to every search operation
- **Why:** Search latency is user-facing; logging is analytical. Decoupling them prevents evaluation instrumentation from degrading search performance. Async approach acceptable because loss of some log entries (on process crash) is acceptable for statistical analysis.
- **Rejected:** Synchronous logging (would add 5-50ms per search), batch logging (more complex, delayed visibility), in-memory buffer with periodic flush (complex failure modes)
- **Trade-offs:** Gains latency (critical for UX) at cost of eventual consistency and possible data loss on crash. Logs become best-effort approximation rather than exact history.
- **Breaking if changed:** Converting to synchronous logging would expose every search to I/O latency. Removing logging entirely loses observability into retrieval effectiveness.

### Hybrid retrieval uses fixed RRF k=60 constant rather than configurable parameter (2026-02-24)
- **Context:** Merging BM25 lexical search with cosine similarity semantic search rankings
- **Why:** RRF (Reciprocal Rank Fusion) with fixed k is standard ML approach for combining ranking systems. k=60 is commonly used baseline.
- **Rejected:** Parameterized k value requiring calibration per use case; or different merge algorithms (learned-to-rank, weighted average)
- **Trade-offs:** Fixed k is predictable and requires no tuning but may be suboptimal for specific data distributions. If one ranking system is consistently better, fixed k wastes potential.
- **Breaking if changed:** If k=60 needs adjustment based on production metrics, would require code change and redeployment rather than configuration change

### Serial rate-limited processing (6000ms delays = 10 Haiku calls/minute) instead of batch processing all questions together (2026-02-24)
- **Context:** Generating 3 questions per chunk via Claude Haiku for n chunks
- **Why:** Predictable rate limiting respects API quotas; easier to reason about and observe; avoids burst spike risks
- **Rejected:** Batch process multiple chunks' questions in parallel or single batch; would be faster but harder to control and could trigger rate limits
- **Trade-offs:** Slower overall throughput (serial) vs safer, more observable rate limiting. At scale, becomes bottleneck for large knowledge stores
- **Breaking if changed:** Switching to batch processing requires redesign of rate limiting strategy and could cause API quota issues if not carefully managed

#### [Gotcha] Embedding averaging uses simple element-wise mean without normalization, which preserves variance and potential magnitude differences across embeddings (2026-02-24)
- **Situation:** Averaging 3 question embeddings into single representative vector for similarity search
- **Root cause:** Simple, fast computation; matches averaging used elsewhere in codebase
- **How to avoid:** Speed/simplicity gained vs potential retrieval quality loss if embeddings have heterogeneous scales; doesn't follow typical embedding best practices

### Use first 500 characters of chunk content as context for question generation (plus heading if present) (2026-02-24)
- **Context:** Balancing API cost (token count) against context quality for Haiku question generation
- **Why:** Hardcoded balance: enough context for meaningful questions, short enough to keep Haiku calls cheap (<200 tokens)
- **Rejected:** Full chunk content (might be kilobytes, expensive); summary extraction (adds complexity); configurable (adds operational burden)
- **Trade-offs:** Cost control gained; but loses information if key content is after 500 chars (deterministic data loss)
- **Breaking if changed:** If knowledge store contains chunks where critical content appears after 500 chars, questions will be misleading or irrelevant

### buildComponentMap creates ID→node index for reusable components rather than searching tree on each ref resolution (2026-02-24)
- **Context:** Component instances reference definitions via IDs; resolveRef needs O(1) lookup of component source
- **Why:** Design files likely have 10-50+ component references that resolve to 2-10 unique definitions; linear search through tree is O(n) per ref, so 100 refs = O(100n); indexing is O(n + m) where m=refs, drastically faster for many refs
- **Rejected:** Direct tree search on each resolveRef call - would be O(n*m) for m references in doc
- **Trade-offs:** Easier: Fast ref resolution; Harder: Map must be rebuilt if document modified, adds memory overhead for index
- **Breaking if changed:** If map removed, downstream code doing performance analysis wouldn't catch the O(n*m) scaling problem until large files

#### [Pattern] Health checks on all 3 services with setup script polling until healthy (30 retries) before declaring success (2026-02-25)
- **Problem solved:** Automated scripts need to run after monitoring stack starts - must wait for readiness, not just container start
- **Why this works:** Container running ≠ service ready; prevents race conditions where dependent operations fail; polling approach survives temporary startup delays
- **Trade-offs:** Slightly slower startup (waiting for health) vs guaranteed reliable automation; script complexity vs automation robustness

### Strategic label cardinality management: feature_id labels only on cost/duration metrics, but omitted from tokens/executions metrics to prevent combinatorial explosion (2026-02-25)
- **Context:** Each unique label combination creates separate metric series. Using feature_id + model + complexity on all metrics would create O(features × models × complexity) = potentially 10,000s of series.
- **Why:** Prometheus cardinality explosion degrades query performance and storage. Keeping cardinality bounded by limiting high-cardinality label combinations.
- **Rejected:** Could have used consistent labeling scheme (feature_id everywhere) for uniformity, but would hit cardinality limits in production
- **Trade-offs:** Lose per-feature token granularity (can only see global totals by model), but maintain sub-second query latency on metrics dashboard
- **Breaking if changed:** If high-cardinality labels are added later (e.g., feature_id to all metrics), could cause Prometheus scrape failures or dropped series

### Use Set<string> for tracking expanded groups instead of Array or Record<string, boolean> (2026-02-25)
- **Context:** Group expanded state checked on every render to conditionally show/hide group contents and icons
- **Why:** Set provides O(1) containment checking vs O(n) for array.includes() or verbose Record syntax; critical when filtering/rendering many groups
- **Rejected:** Array with .includes() - adequate but degrades with many groups; Record - more verbose with no performance gain
- **Trade-offs:** Better render performance and cleaner code vs. Set is less familiar and less serializable if state persistence added later
- **Breaking if changed:** Switching to array search would degrade UX responsiveness with large component libraries; Set choice matters for performance-critical render path

### Only check for missing CI if PR is in `reviewState === 'pending'`. Early return guards against checking PRs where review flow already started (changes requested, approved, etc). (2026-03-04)
- **Context:** PR review state machine: pending → (changes_requested | approved | dismissed). If not pending, CI failure is no longer the blocker.
- **Why:** Logical correctness: CI checks are run-to-completion gate at start of review. Once review progresses, missing CI is either (a) not a problem, or (b) reviewer's concern, not maintainer's. Avoids false diagnostics.
- **Rejected:** Alternative: check all review states (false positives in merged/dismissed PRs); check only pending (misses edge case where reviewer approved despite missing CI, but that's a review process issue, not our concern).
- **Trade-offs:** One extra state check per PR per poll. Eliminates false positives in completed review flows.
- **Breaking if changed:** Removing guard means alerting on dismissed/merged/approved PRs (noise, incorrect diagnosis of root cause).

#### [Pattern] `appendFile()` instead of write/seek for ledger appends: atomic, concurrent-safe, follows EventLedgerService pattern. Fire-and-forget, no await, no error handling. (2026-03-07)
- **Problem solved:** Multiple concurrent processes might emit events and try to append ledger entries simultaneously. Need fast non-blocking append with atomicity guarantees.
- **Why this works:** fs.promises.appendFile is atomic at OS level (single write call), handles concurrent appends correctly. Fire-and-forget avoids blocking event processing on I/O. Consistent with existing EventLedgerService pattern in codebase.
- **Trade-offs:** Simple API and correct concurrency behavior vs. potential buffering delays and silent append failures (no error handling).

#### [Pattern] `readline` module for streaming JSONL parse on cold start: memory-efficient line-by-line reading instead of loading entire ledger file into memory. (2026-03-07)
- **Problem solved:** Ledger file could grow large over time (weeks/months of events). Cold start must restore all state without OOM on memory-constrained systems.
- **Why this works:** Streaming parser processes one JSONL line at a time, constant memory regardless of file size. readline handles line boundaries and backpressure automatically.
- **Trade-offs:** Slightly more complex code (readline interface vs string split) but guaranteed constant memory footprint.

#### [Pattern] Route handler accepts optional `research` parameter; if not provided, calls `researchRepo()` again before generating spec.md (2026-03-07)
- **Problem solved:** Project setup can chain multiple operations; research is expensive (filesystem traversal + git inspection)
- **Why this works:** Allows flexibility: research can be done once and reused, or each step can stand alone without tight coupling. Caller decides whether to cache.
- **Trade-offs:** More flexible API, but potential for stale data if function called multiple times in session without recomputing research. Caller responsible for managing research freshness.

#### [Pattern] Gate expensive render-time operations (syntax highlighting, markdown parsing, diff computation) behind an `isStreaming` prop. Defer enhancement to completion. (2026-03-09)
- **Problem solved:** Streaming AI responses deliver tokens incrementally. Any useEffect depending on `code`/`content` re-fires on every token.
- **Why this works:** Rendered output during streaming doesn't need to be perfect (users watch text appear). Deferring Prism.js until streaming completes produces identical final result while keeping UI responsive during delivery.
- **Trade-offs:** Easier: eliminates render thrashing, smooth UX. Harder: requires threading `isStreaming` prop through component tree from parent.

#### [Gotcha] Remote caching config in `turbo.json` (Vercel) is inert without `TURBO_TOKEN` and `TURBO_TEAM` env vars. Builds still work—turbo gracefully falls back to local filesystem cache—but remote cache is silently disabled. (2026-03-09)
- **Situation:** Initial investigation: why is remote cache config present but CI builds aren't using Vercel's cache?
- **Root cause:** Vercel's Turborepo is the official remote cache provider. Connection requires OAuth tokens that are environment-specific (local dev ≠ CI ≠ different CI providers).
- **How to avoid:** Local caching works immediately with zero config (+) but misses 30-40% speedup from shared cache across machines (-). CI setup complexity: must inject TURBO_TOKEN/TURBO_TEAM.

#### [Pattern] The `dev` task is excluded from caching (`"cache": false`) and marked `"persistent": true`. This prevents turbo from treating long-running dev servers as completed tasks and respects file watching. (2026-03-09)
- **Problem solved:** Dev servers (e.g., `npm run dev` on apps/server, apps/ui) must stay running and restart on file changes. If cached, turbo would mark task as done and not re-run on changes.
- **Why this works:** Dev servers are stateful, long-lived processes. Caching is designed for deterministic, repeatable tasks (build, test). Persistent flag tells turbo to ignore task completion and let the server manage its own lifecycle.
- **Trade-offs:** Dev UX is preserved (+) but dev servers bypass cache infrastructure (slower feedback than cached tasks, but acceptable for iteration).

#### [Pattern] Error deduplication uses hash-based Set with 1-hour TTL instead of permanent dedup or no dedup (2026-03-09)
- **Problem solved:** Reactive spawner logs errors when workflows fail; needs to avoid log spam while still detecting recurring issues
- **Why this works:** Hash prevents identical error spam (same message = same hash = skip log), 1-hour TTL allows same error to be logged again if it recurs later (user knows issue persists). Balances observability vs noise.
- **Trade-offs:** Added memory for Set tracking, 1h cleanup logic, but much cleaner logs in failure scenarios

#### [Pattern] React memoization (useMemo, stable dependency arrays) already handles the optimization that dangerouslySetInnerHTML was attempting to provide, making the security/maintainability trade-off unnecessary (2026-03-09)
- **Problem solved:** The processedContent useMemo and stable remarkPlugins/rehypePlugins arrays ensure ReactMarkdown only re-renders when content actually changes. The old code assumed dangerouslySetInnerHTML was needed to prevent re-renders, but the memoization layer was already preventing them
- **Why this works:** Once processedContent changes are memoized and plugin arrays are stable, React only reconciles when necessary. Adding dangerouslySetInnerHTML to avoid reconciliation becomes a second-order optimization that adds complexity for minimal gain
- **Trade-offs:** Simpler mental model (one render path) vs. false sense of control from explicit dangerouslySetInnerHTML. The memoization is less obvious in the code but actually more reliable because it's maintained by React's dependency system

#### [Gotcha] WebSocket reconnection is synchronous within HTTP client invalidation, not async queued. This blocks other pending requests during reconnect window (2026-03-10)
- **Situation:** When URL override is set, reconnect() is called immediately before replacing singleton
- **Root cause:** Synchronous approach is simpler to reason about—no race where request hits old client before reconnect completes. But synchronicity means UI freezes if reconnect slow
- **How to avoid:** Easier: simpler control flow. Harder: poor UX if server slow to respond to reconnect

#### [Pattern] Jaccard similarity on normalized word sets (threshold 0.6) chosen for title deduplication over Levenshtein/embedding-based approaches (2026-03-10)
- **Problem solved:** Need lightweight duplication detection to prevent similar features from duplicating in backlog under capacity pressure
- **Why this works:** O(n*w) complexity where w is word count (vs O(n²) for edit distance or network latency for embeddings); word-order-invariant (semantically handles paraphrasing); deterministic and debuggable
- **Trade-offs:** Gained: fast, simple, no external deps. Lost: semantic understanding (doesn't catch 'fix auth bug' vs 'authentication issue' as similar)

#### [Pattern] Singleton HTTP client maintained across lifetime with explicit invalidation when server URL changes (invalidateHttpClient), rather than creating new clients per request (2026-03-10)
- **Problem solved:** Need efficient connection reuse (TCP pooling, keep-alive) while supporting runtime server URL changes
- **Why this works:** Singleton achieves connection pooling and caching efficiency; invalidation pattern allows responding to runtime config changes without losing benefits
- **Trade-offs:** More complex state management (must track and invalidate stale singleton) but significant performance benefit from connection reuse

### Reload feature status early in `process()` and check if it's already done before running external merge detection. Skip gh CLI calls entirely if feature is done. (2026-03-10)
- **Context:** External merge detection requires gh CLI call. Early exit avoids this expensive operation when feature status was already updated by parallel process or earlier state change.
- **Why:** gh CLI calls are relatively expensive (subprocess spawn, network latency to GitHub). Single status check (reload) is cheap. Skip detection if not needed.
- **Rejected:** Always running merge detection regardless of current status — wastes gh CLI calls on features that are already done
- **Trade-offs:** Extra feature reload on every REVIEW.process() call, but saves many gh CLI calls. Reload is cached/fast; gh calls are not.
- **Breaking if changed:** If early status check is removed, forces unnecessary gh CLI calls on every loop iteration, increasing latency and GitHub API quota usage