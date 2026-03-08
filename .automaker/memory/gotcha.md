---
tags: [gotcha]
summary: gotcha implementation decisions and patterns
relevantTo: [gotcha]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 5
  referenced: 1
  successfulFeatures: 1
---
# gotcha

#### [Gotcha] Features in 'review' status must have prNumber field populated; no validation of this invariant in task (2026-02-10)
- **Situation:** Task assumes feature.prNumber exists if feature.status === 'review'. No defensive checks.
- **Root cause:** Assumed board-health system maintains this invariant (features only marked 'review' after PR created). Defensive checks add noise.
- **How to avoid:** Trust the invariant vs defensive programming. Silence if invariant breaks (prNumber undefined = skipped feature, hard to debug). Documented in notes to avoid later confusion.

#### [Gotcha] npm install failed initially with 'node-pty rebuild requiring Python' when installing dagre dependencies. Required --ignore-scripts --legacy-peer-deps flags. (2026-02-19)
- **Situation:** Adding dagre and @types/dagre to package.json triggered post-install build scripts that needed Python toolchain
- **Root cause:** node-pty is a transitive dependency of some package that requires native compilation. The --ignore-scripts flag skips post-install scripts, --legacy-peer-deps allows peer dependency resolution.
- **How to avoid:** Easier: quick installation. Harder: skipping scripts hides potential issues with other packages, creates maintenance debt if actual native compilation is needed later.

#### [Gotcha] Build failures don't necessarily indicate code correctness - distinguished environment issue (missing p-limit in node_modules) from actual code problems by verifying only apps/ui files were changed, not libs/platform (2026-02-21)
- **Situation:** Build failed during verification but all feature changes were isolated to apps/ui; libs/platform/secure-fs.ts error indicated upstream dependency problem
- **Root cause:** Dependency resolution failures can occur independently of code changes; git diff provides objective proof of which files changed vs where errors occur - if error file wasn't modified, it's likely environmental
- **How to avoid:** Requires discipline to check actual changes vs error locations; prevents blame-shifting but needs clear attribution

#### [Gotcha] Write tool creates files relative to current directory, not to the provided file path - requires absolute paths to create files in desired locations. (2026-02-22)
- **Situation:** Attempted to create monitor service files in `apps/server/src/services/` but files were created relative to tool execution context.
- **Root cause:** Tool implementation detail - interpreting path as destination location but executing relative to context.
- **How to avoid:** None - this is simply correct usage vs incorrect usage. Requires remembering to use absolute paths.

#### [Gotcha] Monorepo build verification failed on unrelated package (secure-fs.ts TypeScript error), making it unclear if this feature's package builds correctly without isolated testing (2026-02-23)
- **Situation:** Running `npm run build:packages` for final verification
- **Root cause:** Monorepo build orchestration includes all packages as a single operation. Pre-existing errors in other packages block the entire build, preventing clear signal on this feature's package health.
- **How to avoid:** Easier: Discover build isolation issue. Harder: Can't verify full monorepo build status. Breaking: If build system requires all packages to succeed, this feature can't deploy until secure-fs is fixed

#### [Gotcha] OG meta tags must use absolute URLs, not relative URLs, because social media crawlers are external services without context to resolve relative URLs (2026-02-24)
- **Situation:** Implementing og:image meta tags for social sharing across landing pages
- **Root cause:** Social platforms crawl pages from their own servers and cannot resolve relative URLs the way a browser would. The crawler has no concept of the base URL context
- **How to avoid:** Absolute URLs require hardcoding domain and are harder to manage across environments (dev/staging/prod), but are mandatory for external crawlers

#### [Gotcha] Same satisfiedStatuses list appears in 3+ separate functions within single resolver.ts file. Each function is responsible for keeping this in sync independently. (2026-02-24)
- **Situation:** Three functions (areDependenciesSatisfied, getBlockingDependencies, getBlockingDependenciesFromMap) each had their own copy of which statuses count as 'satisfied'
- **Root cause:** Each function may have evolved independently to solve different caller needs. Extracting to constant might seem premature optimization until a change reveals the cost.
- **How to avoid:** Explicit local context (understand status list in each function) vs DRY principle (maintenance burden of 3 copies)

#### [Gotcha] Pre-existing build issues in monorepo blocked full verification: platform package (p-limit import error) and UI app (react-day-picker dependency) (2026-02-25)
- **Situation:** Could verify types package builds and types export correctly, but couldn't verify full app build or runtime behavior
- **Root cause:** Monorepo with multiple interdependent packages. One package's build failure cascades. Implementation is likely correct but unverifiable in broken build state.
- **How to avoid:** Could implement feature but couldn't prove it works end-to-end. Partial verification still valuable (types correct, no compilation errors in changed files)

#### [Gotcha] ProjectSettingsPanel and ProjectSettingsView are separate components on different routes, risking duplication of webhook settings UI logic (2026-03-07)
- **Situation:** /project-settings uses ProjectSettingsView with ProjectWebhooksSection; new ProjectSettingsPanel is milestone component with same webhook validation
- **Root cause:** Feature built incrementally; ProjectSettingsPanel is new milestone piece for future Project Page Hub; old route unchanged
- **How to avoid:** Easier: ship incrementally without touching stable routes. Harder: two components with similar webhook logic; maintenance burden if validation changes