---
tags: [gotcha]
summary: gotcha implementation decisions and patterns
relevantTo: [gotcha]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 0
  successfulFeatures: 0
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