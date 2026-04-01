/**
 * Verification tier instructions for agent execution.
 *
 * Three tiers of verification depth, auto-selected based on feature complexity
 * and failure history. Injected into the agent's context alongside the feature
 * description so the agent knows how thorough its testing should be.
 */

import type { VerificationTier } from '@protolabsai/types';

/**
 * Tier 1: Quick Smoke
 * For small/trivial changes — confirm the primary code path works without
 * running the full test suite.
 */
const SMOKE_VERIFICATION_INSTRUCTIONS = `## Verification Strategy: Quick Smoke (Tier 1)

This feature is classified as **small complexity**. Apply Quick Smoke verification:

1. Confirm the primary code path compiles and works (type-check changed packages only)
2. Run ONE relevant test file that covers the changed code — not the full suite
3. Skip integration tests and end-to-end tests
4. Skip Playwright unless the change directly touches the UI

**Command guidance:**
- Type-check: \`pnpm --filter <changed-package> typecheck\` (not \`pnpm run typecheck\` for the whole monorepo)
- Single test file: \`node /path/to/node_modules/.bin/vitest run path/to/specific.test.ts\`

Log your verification tier in your summary: \`Verification: Tier 1 — Quick Smoke\``;

/**
 * Tier 2: Targeted Regression
 * For medium/large changes — test changed files and adjacent behavior.
 */
const REGRESSION_VERIFICATION_INSTRUCTIONS = `## Verification Strategy: Targeted Regression (Tier 2)

This feature is classified as **medium or large complexity**. Apply Targeted Regression verification:

1. Run test files matching the directories of changed files
2. Run the full type-check (\`pnpm run typecheck\`)
3. Verify error handling paths work as expected
4. Run format check on changed files (\`node project_root/node_modules/.bin/prettier --check <changed-files> --ignore-path /dev/null\`)
5. Run Playwright verification if UI behavior changed

**Command guidance:**
- Related tests: \`node /path/to/node_modules/.bin/vitest run tests/unit/<changed-dir>/\`
- Format check: \`node <project_root>/node_modules/.bin/prettier --check <file> --ignore-path /dev/null\`

Log your verification tier in your summary: \`Verification: Tier 2 — Targeted Regression\``;

/**
 * Tier 3: Deep Verification
 * For architectural changes or features with 2+ prior failures — full suite.
 */
const DEEP_VERIFICATION_INSTRUCTIONS = `## Verification Strategy: Deep Verification (Tier 3)

This feature is classified as **architectural complexity** or has had **2+ prior failures**. Apply Deep Verification:

1. Run the full test suite: \`pnpm run test:all\`
2. Run integration tests if any wiring was changed (new service registrations, new routes, new imports)
3. Build verification — packages, server, and UI: \`pnpm run build\`
4. Full type-check: \`pnpm run typecheck\`
5. In your summary, document what was verified and any risks or caveats

**Wiring checklist (check each if applicable):**
- [ ] Every new file has at least one non-test importer
- [ ] Every new service is registered in the server startup or dependency injection
- [ ] New API routes are reachable from the route registry
- [ ] New exports are included in the relevant \`index.ts\`

Log your verification tier in your summary: \`Verification: Tier 3 — Deep Verification\``;

/**
 * Returns the verification instruction block for the given tier.
 */
export function getVerificationTierInstructions(tier: VerificationTier): string {
  switch (tier) {
    case 'smoke':
      return SMOKE_VERIFICATION_INSTRUCTIONS;
    case 'regression':
      return REGRESSION_VERIFICATION_INSTRUCTIONS;
    case 'deep':
      return DEEP_VERIFICATION_INSTRUCTIONS;
  }
}
