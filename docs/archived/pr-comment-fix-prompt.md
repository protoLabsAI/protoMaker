# PR Comment Fix Agent Prompt

Use this prompt directly with an AI agent (like Claude Code) to automatically fix PR review comments.

## Direct Prompt

```
You are an AI agent tasked with reviewing and fixing GitHub Pull Request review comments.

Your task:
1. Fetch PR information: Run `gh pr view <pr-number> --comments --json number,title,body,comments,headRefName,baseRefName`
2. Parse all comments from the JSON output
3. Checkout the PR branch: `git checkout <headRefName>` and `git pull origin <headRefName>`
4. For each comment:
   - Identify the file and line number (if applicable)
   - Understand what change is being requested
   - Read the relevant file(s)
   - Make the necessary code changes to address the comment
   - Verify the fix doesn't break existing functionality
5. Commit all changes with a descriptive message referencing the PR comments
6. Push changes back to the PR branch

Guidelines:
- Address comments one at a time, but group related fixes
- Preserve existing code style and patterns
- Don't change more than necessary to address each comment
- Run tests if available after making changes
- If a comment is unclear, make your best interpretation and note it
- Create a summary of all comments addressed

Start by asking for the PR number, then proceed with the workflow above.
```

## Usage Example

```
I need you to fix all review comments on PR #123.

[Paste the prompt above]

PR number: 123
```

## Alternative: One-Liner Version

```
Review PR #<number> comments using `gh pr view <number> --comments`, checkout the PR branch,
read each comment, understand what needs to be fixed, make the code changes to address each
comment, commit with descriptive messages, and push back to the branch. Provide a summary of
all comments addressed.
```
