# Issue Dedupe

Stops the triage / self-improvement automation from re-filing issues that already exist. Before a producer opens a new System Improvement / auto-remediation feature, it checks against open features and skips (or respects a cooldown) on a match.

## The service

`IssueDedupeService.check(projectPath, title, fingerprint?, sourceId?)` (`apps/server/src/services/issue-dedupe-service.ts`) returns `{ isDuplicate, match?, noMatch? }`, evaluated in priority order:

1. **Fingerprint** (exact) — an open feature whose **description or title** contains the marker `fp:{fingerprint}`. Strongest signal.
2. **Source ID** (exact) — an open feature whose `githubIssueNumber` equals `sourceId`.
3. **Title similarity** (fuzzy) — Jaccard word-set overlap above threshold, after stripping common automation prefixes (`[Auto]`, `System Improvement:`, etc.). Only matches automation-filed titles, not user features.
4. **Cooldown** — if a _recently closed_ feature is similar, suppress re-filing for a window (avoids immediately recreating a closed-as-duplicate).

The open-feature list is fetched via `featureLoader.getAll` and cached briefly (TTL); a fetch failure fails open (returns no match) so a transient outage never blocks a legitimate filing.

## The fingerprint marker convention

For the exact-fingerprint path to work, the filing producer must **stamp** the marker into the feature it creates. Producers append a hidden HTML comment to the description:

- `friction-tracker-service` → `<!-- fp:friction:${pattern} -->` (and passes `friction:${pattern}` to `check()`)
- `hitl-pattern-analysis-service` → `<!-- fp:hitl:${signature} -->` (and passes `hitl:${signature}` to `check()`)

The marker is invisible in rendered markdown but `findFingerprintMatch` matches it via `description.includes('fp:...')`. Without stamping, only the title-similarity + cooldown paths apply.

## Where it's wired

Both producers call `issueDedupe.check(...)` **before** creating the feature and skip on `isDuplicate` or `noMatch.cooldown`:

- `apps/server/src/services/friction-tracker-service.ts` — `maybeFileImprovement`
- `apps/server/src/services/hitl-pattern-analysis-service.ts` — `doMaybeFileFeature`

A legacy exact-title `findByTitle` check remains as a second line of defense (survives restarts).

## Key files

- `apps/server/src/services/issue-dedupe-service.ts` — the service
- `apps/server/tests/unit/services/issue-dedupe-service.test.ts` — match-priority + cooldown coverage
