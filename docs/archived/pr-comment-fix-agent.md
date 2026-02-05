# PR Comment Fix Agent Instructions

## Overview

This agent automatically reviews a GitHub Pull Request, analyzes all comments, and systematically addresses each comment by making the necessary code changes.

## Workflow

### Step 1: Fetch PR Information

1. Use the GitHub CLI command: `gh pr view <pr-number> --comments --json number,title,body,comments,headRefName,baseRefName`
2. Parse the JSON output to extract:
   - PR number and title
   - PR description/body
   - All comments (including review comments and inline comments)
   - Branch information (head and base branches)

### Step 2: Analyze Comments

For each comment, identify:

- **Type**: Review comment, inline comment, or general comment
- **File path**: If it's an inline comment, extract the file path
- **Line number**: If it's an inline comment, extract the line number(s)
- **Intent**: What change is being requested?
  - Bug fix
  - Code style/formatting
  - Performance improvement
  - Refactoring
  - Missing functionality
  - Documentation update
  - Test addition/modification
- **Priority**: Determine if it's blocking (must fix) or non-blocking (nice to have)

### Step 3: Checkout PR Branch

1. Ensure you're in the correct repository
2. Fetch the latest changes: `git fetch origin`
3. Checkout the PR branch: `git checkout <headRefName>`
4. Pull latest changes: `git pull origin <headRefName>`

### Step 4: Address Each Comment Systematically

For each comment, follow this process:

#### 4.1 Read Relevant Files

- If the comment references a specific file, read that file first
- If the comment is general, read related files based on context
- Understand the current implementation

#### 4.2 Understand the Request

- Parse what specific change is needed
- Identify the root cause or issue
- Consider edge cases and implications

#### 4.3 Make the Fix

- Implement the requested change
- Ensure the fix addresses the exact concern raised
- Maintain code consistency with the rest of the codebase
- Follow existing code style and patterns

#### 4.4 Verify the Fix

- Check that the change resolves the comment
- Ensure no new issues are introduced
- Run relevant tests if available
- Check for linting errors

### Step 5: Document Changes

For each comment addressed:

- Add a comment or commit message referencing the PR comment
- If multiple comments are addressed, group related changes logically

### Step 6: Commit Changes

1. Stage all changes: `git add -A`
2. Create a commit with a descriptive message:

   ```
   fix: address PR review comments

   - [Brief description of fix 1] (addresses comment #X)
   - [Brief description of fix 2] (addresses comment #Y)
   - ...
   ```

3. Push changes: `git push origin <headRefName>`

## Comment Types and Handling

### Inline Code Comments

- **Location**: Specific file and line number
- **Action**: Read the file, locate the exact line, understand context, make targeted fix
- **Example**: "This function should handle null values" → Add null check

### Review Comments

- **Location**: May reference multiple files or general patterns
- **Action**: Read all referenced files, understand the pattern, apply fix consistently
- **Example**: "We should use async/await instead of promises" → Refactor all instances

### General Comments

- **Location**: PR-level, not file-specific
- **Action**: Understand the broader concern, identify affected areas, make comprehensive changes
- **Example**: "Add error handling" → Review entire PR for missing error handling

## Best Practices

1. **One Comment at a Time**: Address comments sequentially to avoid conflicts
2. **Preserve Intent**: Don't change more than necessary to address the comment
3. **Test Changes**: Run tests after each significant change
4. **Ask for Clarification**: If a comment is ambiguous, note it but proceed with best interpretation
5. **Group Related Fixes**: If multiple comments address the same issue, fix them together
6. **Maintain Style**: Follow existing code style, formatting, and patterns
7. **Check Dependencies**: Ensure fixes don't break other parts of the codebase

## Error Handling

- If a comment references a file that doesn't exist, note it and skip
- If a line number is out of range (file changed), search for similar code nearby
- If a fix introduces breaking changes, revert and try a different approach
- If tests fail after a fix, investigate and adjust the implementation

## Completion Criteria

The agent has successfully completed when:

1. All comments have been analyzed
2. All actionable comments have been addressed with code changes
3. All changes have been committed and pushed
4. A summary of addressed comments is provided

## Example Output Summary

```
PR #123 Review Comments - Addressed

✅ Comment #1: Fixed null handling in getUserData() (line 45)
✅ Comment #2: Added error handling for API calls
✅ Comment #3: Refactored to use async/await pattern
⚠️  Comment #4: Requires clarification - noted in commit message
✅ Comment #5: Fixed typo in documentation

Total: 5 comments, 4 addressed, 1 requires clarification
```
