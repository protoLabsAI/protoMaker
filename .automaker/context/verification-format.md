# Verification Format

Every verification step must use structured proof format. No exceptions.

## Required Format

```
### Check: [what is being verified]
**Command:** `[exact command run]`
**Output:**
```
[copy-pasted terminal output, truncated to relevant lines]
```
**Result:** PASS / FAIL
```

## Rules

- Every code change requires at least one verification check.
- Use the exact command you ran — no paraphrasing.
- Paste actual terminal output — truncate to relevant lines if long.
- If the result is FAIL, stop and fix before continuing.

## Standard Verification Commands

**Build** (if types or server files changed):
```
npm run build:packages && npm run build:server
```

**Tests** (targeted, not full suite):
```
npm run test:server -- tests/unit/specific.test.ts
```

**Format** (changed files only):
```
npx prettier --check <changed-files>
```

## Disallowed Phrases

Never write these — they are claims without evidence:

- "looks correct"
- "should work"
- "tests likely pass"
- "the build should succeed"
- "this appears to be working"

If you cannot run a command to verify, say so explicitly:
`**Result:** SKIPPED — [reason why verification could not run]`
