# Verification Discipline

**CRITICAL: Always verify claims with fresh evidence before stating results.**

## The Gate Function (Mandatory Before Any Completion Claim)

Before you claim anything is complete or working, follow this gate function religiously:

1. **IDENTIFY**: What command or check proves the claim?
   - Be specific. "Tests pass" requires a test command with output, not a statement.
   - "Build succeeds" requires actual build command output.

2. **RUN**: Execute the command fresh (NOT from memory or cache)
   - Never assume a previous run still holds true.
   - Run it NOW, not based on what you think happened before.

3. **READ**: Read the FULL output
   - Don't just scan for "success" or "0 failures".
   - Actually read the output line by line.

4. **VERIFY**: Confirm output matches the claim
   - Does the test output show 0 failures?
   - Does the build exit with code 0?
   - Are there no warnings in the relevant section?

5. **CLAIM**: Only THEN state the result
   - After you have fresh evidence, you can write "Tests pass" or "Build succeeds".
   - In summaries, reference the actual command output.

## Common Failures Table

| Claim | Required Evidence | NOT Sufficient |
|-------|------------------|----------------|
| "Tests pass" | Test command output showing 0 failures, all tests passing | "Should pass", "I ran them before", cached results, "expected to pass" |
| "Build succeeds" | Build command output showing exit code 0, no critical errors | "No errors expected", "looks good", previous successful build |
| "No regressions" | Full test suite output showing all tests pass | Running subset of tests, "manual testing looks ok" |
| "Changes are minimal" | `git diff --stat` output showing file count and line changes | "I only changed X", "should be small", eyeballing the diff |
| "Code compiles" | TypeScript compilation output with exit 0, no type errors | "Types look right", "should compile", previous compile |
| "Types resolve correctly" | Running `tsc --noEmit`, output shows 0 errors | "Types look good", "should work" |
| "Linting passes" | `npm run lint` output showing 0 errors | "Didn't change any linting issues", "should pass" |

## Rationalization Prevention Table

**If you catch yourself thinking any of these, STOP and RUN the verification:**

| If you think... | The correct response is... |
|-----------------|--------------------------|
| "Should work now" | RUN the verification command. Don't assume. |
| "I'm confident it's correct" | Confidence != evidence. RUN it anyway. |
| "Just this once I'll skip" | No exceptions. EVERY claim needs verification. |
| "The agent/previous run said success" | Verify independently. RUN it fresh. |
| "It's a trivial change" | Trivial changes still need verification. RUN it. |
| "I already know this works" | You might be mistaken. RUN the check. |
| "There's no time for verification" | Verification is NOT optional. Make time. |
| "The test runner was working before" | Test it again NOW. Don't rely on memory. |

## Red Flags — STOP if you catch yourself thinking:

- "I don't need to check because..."
- "This is too simple to verify"
- "I already know this works"
- "Let me just claim this and move on"
- "The previous session said it works"
- "I'm confident enough that I don't need to verify"
- "Let me skip verification just for this one claim"

**When you see a red flag: STOP. RUN the command. Read the output. THEN claim.**

## Application to Automaker Workflow

### Before Writing Summary Tags

All claims in your `<summary>` tags must have fresh verification:

- **Build claims** ("Build succeeds"): Must show actual `npm run build:server` or `npm run build:packages` output with exit 0
- **Test claims** ("All tests pass"): Must show actual test runner output showing 0 failures
- **Compilation claims** ("Code compiles"): Must show TypeScript compilation output with exit 0
- **Lint claims** ("Linting passes"): Must show `npm run lint` output with 0 errors
- **Changes claims** ("Changes are minimal"): Must show `git diff --stat` output

### Build Verification Checklist

Before claiming a build succeeds:

```bash
# 1. IDENTIFY the build command for the modified files
npm run build:packages    # If you changed libs/*
npm run build:server      # If you changed apps/server/*
npm run build             # For the full build

# 2. RUN the command fresh
# (Actually run it, not from memory)

# 3. READ the output - look for:
# - Exit code 0 (success)
# - No "ERROR" lines in critical sections
# - Completion message

# 4. VERIFY against the claim
# Does the output show the build succeeded?

# 5. CLAIM only after verification
# NOW you can write: "Build verified with: npm run build:server"
```

### Test Verification Checklist

Before claiming tests pass:

```bash
# 1. IDENTIFY what tests to run
npm run test:server       # For server-side changes
npm run test:packages     # For libs/* changes
npm run test             # For full test suite

# 2. RUN the command fresh

# 3. READ the output - look for:
# - Test count summary
# - Failure count (should be 0)
# - No "FAIL" or "ERROR" lines

# 4. VERIFY against the claim
# Does the output show all tests passed?

# 5. CLAIM only after verification
# NOW you can write: "Tests verified with: npm run test:server"
```

### Type Checking Verification Checklist

Before claiming types are correct:

```bash
# 1. Run TypeScript compiler check
npm run build:packages

# 2. Look for output lines like:
# - "Successfully built" or "0 errors"
# - NO lines with "error TS"

# 3. If you changed specific type files:
# - Manually import and use the types in a test file
# - Verify they resolve without errors

# 4. CLAIM only after verification
# NOW you can write: "Types verified with successful build"
```

## Example: The Right Way vs. Wrong Way

### ❌ WRONG (Rationalization)

> "I've created the context file at `.automaker/context/verification-discipline.md`. The file includes all required sections and follows the markdown format. The implementation is complete."

Why this is wrong:
- No verification that the file actually exists
- No check that it's valid markdown
- No confirmation that it will be loaded by `loadContextFiles()`

### ✅ RIGHT (With Verification)

> "I've created the context file at `.automaker/context/verification-discipline.md`.
>
> **Verification**: File exists and is readable:
> ```
> $ ls -la .automaker/context/verification-discipline.md
> -rw-r--r-- ... verification-discipline.md
>
> $ head -5 .automaker/context/verification-discipline.md
> # Verification Discipline
> **CRITICAL: Always verify claims with fresh evidence before stating results.**
> ...
> ```
>
> The implementation is complete and verified."

Why this is right:
- Shows the actual file exists (with ls output)
- Shows the file is readable and has correct content (head output)
- Provides actual evidence, not assumptions

## Integration with Agent Prompts

This file is automatically loaded by `loadContextFiles()` in:
- `apps/server/src/services/auto-mode-service.ts`
- `apps/server/src/services/agent-service.ts`
- Any other service using `loadContextFiles()` from `@protolabs-ai/utils`

When agents receive prompts for feature implementation, this verification discipline is injected as part of the system prompt. **All agents MUST follow this discipline when claiming completion.**

### For Agents: How This Affects You

- Before you write a summary with ANY completion claim, verify it
- The "gate function" (IDENTIFY → RUN → READ → VERIFY → CLAIM) is not optional
- Red flags mean STOP and verify before continuing
- Build and test output MUST be shown, not assumed
