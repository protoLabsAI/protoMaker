# Systematic Debugging Methodology

This guide establishes a disciplined approach to debugging. Use this methodology for ALL errors, failures, and bugs.

## The 4-Phase Root Cause Process

### Phase 1: Investigate (DO NOT FIX YET)

Before making any changes, gather evidence and understand the problem thoroughly.

1. **Read the full error message and stack trace**
   - Copy the EXACT error message
   - Read the stack trace from top to bottom
   - Note the file, line number, and function name where the error occurred

2. **Reproduce the error with a specific command**
   - Run the exact command that fails
   - Note the full output and any warnings
   - Try to reproduce it consistently

3. **Check what changed recently**
   - Run `git log --oneline -10` to see recent commits
   - Run `git diff` to see uncommitted changes
   - Run `git diff HEAD~1` to see what changed in the last commit
   - Look for changes that could cause this specific error

4. **Gather evidence at component boundaries**
   - Check inputs: What data is entering the failing function?
   - Check outputs: What should the function return?
   - Add temporary logging if needed to see actual values
   - Compare expected vs actual values

5. **Trace data flow BACKWARD from the error to the source**
   - Start at the error location
   - Look at what value or state caused it
   - Trace backwards to where that value came from
   - Continue until you find where the bad value originated

### Phase 2: Pattern Analysis

Find similar working code and identify what's different.

1. **Find a working example of similar code in the codebase**
   - Search for similar patterns that work correctly
   - Look in tests for examples
   - Check related files in the same module

2. **Compare the working code vs broken code**
   - Line by line, what is different?
   - Document the differences
   - Focus on the differences that could cause the error

3. **Identify the specific difference that causes the failure**
   - Which difference is responsible?
   - Verify this is the root cause, not a symptom
   - Test your hypothesis in Phase 3

### Phase 3: Hypothesis and Test

Form a single hypothesis and test it minimally.

1. **Form ONE hypothesis**
   - "The bug is because X is not initialized"
   - "The bug is because Y is called with the wrong type"
   - "The bug is because Z changed but Q wasn't updated"
   - Be specific and precise

2. **Make the MINIMAL change to test it**
   - Make ONE small change
   - Do NOT make multiple changes at once
   - Do NOT refactor while debugging
   - Just test the hypothesis

3. **Verify the fix resolves the error**
   - Run the exact command that failed before
   - Confirm the error is gone
   - Check that the output is now correct

4. **Verify no regressions**
   - Run the full test suite for affected modules
   - Run related tests in the same directory
   - Check that no new errors appeared

### Phase 4: Implement

After verification, clean up and finalize.

1. **If the fix works, clean it up**
   - Remove any temporary logging
   - Make sure the change is minimal and clear
   - Follow the project's code style

2. **Run full build and tests**
   - Build all packages: `npm run build:packages`
   - Build the server: `npm run build:server`
   - Run tests: `npm run test` or `npm run test:server`

3. **Document what was wrong and why**
   - In your summary, explain the root cause
   - Explain why the fix works
   - Note any patterns to watch for in the future

## The 3-Strike Rule

If you have attempted **3 or more fixes** and the error persists:

- **STOP fixing immediately**
- Document what you've tried:
  - What was the hypothesis?
  - What change did you make?
  - What was the result?
- Report that the problem is likely architectural or a deeper issue
- Clearly state that the issue should be escalated for further investigation
- Do NOT attempt a 4th fix

This rule prevents wasted effort and ensures problems are escalated appropriately.

## Root Cause Tracing Technique

Use this systematic approach to find where a bug originates.

1. **Start at the error**
   - Identify the exact line that fails
   - Look at the value that caused the error

2. **Trace BACKWARD through the call stack**
   - Where did that value come from?
   - Look at the line that set/returned that value
   - Move up one level in the stack

3. **At each level, verify inputs are what you expect**
   - Print or log the input values
   - Compare to what the function should receive
   - Is this the function's fault, or did it receive bad input?

4. **The bug is at the FIRST level where inputs are wrong**
   - Once you find a function receiving unexpected input
   - The bug is in the function that produced that input
   - That's where the fix belongs

## Rationalization Prevention Table

This table catches common thinking errors that prevent effective debugging.

| If you think... | The correct response is... |
|---|---|
| "Quick fix — just change X" | Stop. Investigate first. Understand WHY before fixing. |
| "I'll try this and see" | Stop. Form a hypothesis first. Random changes waste time and introduce new bugs. |
| "It's probably just a typo" | Stop. Verify. Read the actual error message carefully. |
| "Let me rewrite this section" | Stop. Rewrites are not debugging. Find the root cause. Make a minimal fix. |
| "This worked before, must be something else" | Check what changed. `git log`, `git diff`. The answer is in version control. |
| "I'll just add a null check here" | Verify this is the root cause. Maybe the bug is why the value is null. |
| "The error is in the library/framework" | Check the version. Check if you're using the API correctly. Blame externals last. |
| "I need to refactor this to fix it" | Refactoring is not debugging. Fix the bug first in the current structure. |

## Red Flags — STOP if you catch yourself

These are signs you've left the systematic approach and are guessing.

- **Making changes without understanding the error** — Go back to Phase 1
- **Trying a 4th fix attempt** — Apply the 3-Strike Rule
- **Rewriting working code instead of finding the bug** — Go back to Phase 2
- **Blaming the framework/library without checking your code** — Check your usage first
- **Trying multiple fixes in quick succession** — Slow down. One hypothesis per test.
- **Not running tests after the fix** — Always verify no regressions
- **Skipping Phase 1 investigation** — Never skip investigation
- **Changing code before understanding the error** — Always investigate first

## When to Ask for Help

Escalate if:

- You've applied the 3-Strike Rule (3+ failed fixes)
- The error is in unfamiliar code and you can't find patterns
- The error happens across multiple independent systems
- You've completed Phase 1 investigation but can't form a reasonable hypothesis
- The error is intermittent and you can't reproduce it consistently

Document your investigation findings clearly when escalating, including:
- What you've tried
- What you learned from Phase 1 investigation
- Why you couldn't complete Phase 2 analysis
- Your best guess at the root cause (if any)
